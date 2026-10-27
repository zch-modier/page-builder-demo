import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { once } from 'node:events'
import { pipeline } from 'node:stream/promises'
import { randomUUID } from 'node:crypto'
import express from 'express'
import { CHUNK_DIR, UPLOAD_DIR, db } from './db.mjs'

const CHUNK_SIZE = 5 * 1024 * 1024
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024
const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 只有这些类型允许 inline 直接渲染，其余一律强制下载。
// SVG / HTML 能执行脚本，所以不在白名单里（同源 XSS 风险）。
const INLINE_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
])

function encodeFilename(name) {
  // RFC 5987：encodeURIComponent 不转义 ' ( ) *，这里补上
  return encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

export const filesRouter = express.Router()

const chunkDirOf = (id) => path.join(CHUNK_DIR, id)
const partPath = (id, index) => path.join(chunkDirOf(id), `${index}.part`)

function reject(res, status, message) {
  res.status(status).json({ error: message })
}

/* ---------- 1. 创建上传任务 ---------- */

filesRouter.post('/files', (req, res) => {
  const { name, size, mime } = req.body ?? {}

  const cleanName = typeof name === 'string' ? name.trim() : ''
  if (cleanName === '') {
    return reject(res, 400, '缺少文件名')
  }
  // 控制字符会污染响应头（Content-Disposition），长度也要限制
  if (cleanName.length > 255 || /[\u0000-\u001f\u007f]/.test(cleanName)) {
    return reject(res, 400, '文件名不合法')
  }
  if (!Number.isInteger(size) || size <= 0) {
    return reject(res, 400, '文件大小不合法')
  }
  if (size > MAX_FILE_SIZE) {
    return reject(res, 413, '文件超过 2GB 上限')
  }

  const fileId = randomUUID()
  const totalChunks = Math.max(1, Math.ceil(size / CHUNK_SIZE))
  const safeMime = typeof mime === 'string' && mime !== '' ? mime : 'application/octet-stream'

  db.prepare(
    `INSERT INTO uploads (id, name, size, mime, chunk_size, total_chunks, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(fileId, cleanName, size, safeMime, CHUNK_SIZE, totalChunks, new Date().toISOString())

  fs.mkdirSync(chunkDirOf(fileId), { recursive: true })

  console.log(`[upload] init ${fileId} "${cleanName}" ${size}B -> ${totalChunks} chunks`)
  res.status(201).json({ fileId, chunkSize: CHUNK_SIZE, totalChunks })
})

/* ---------- 2. 上传单个分片（裸二进制流） ---------- */

filesRouter.put('/files/:id/chunk/:index', async (req, res) => {
  const { id } = req.params
  if (!ID_RE.test(id)) return reject(res, 400, 'fileId 不合法')

  const index = Number(req.params.index)
  const upload = db.prepare('SELECT * FROM uploads WHERE id = ?').get(id)
  if (!upload) return reject(res, 404, '上传任务不存在或已完成')
  if (!Number.isInteger(index) || index < 0 || index >= upload.total_chunks) {
    return reject(res, 400, '分片序号超出范围')
  }

  const dir = chunkDirOf(id)
  await fsp.mkdir(dir, { recursive: true })

  const target = partPath(id, index)
  const tmp = `${target}.tmp`

  try {
    await pipeline(req, fs.createWriteStream(tmp))
    await fsp.rename(tmp, target)
  } catch (error) {
    await fsp.rm(tmp, { force: true })
    throw error
  }

  const { size } = await fsp.stat(target)
  res.json({ ok: true, index, bytes: size })
})

/* ---------- 3. 合并分片 ---------- */

filesRouter.post('/files/:id/complete', async (req, res) => {
  const { id } = req.params
  if (!ID_RE.test(id)) return reject(res, 400, 'fileId 不合法')

  const upload = db.prepare('SELECT * FROM uploads WHERE id = ?').get(id)
  if (!upload) return reject(res, 404, '上传任务不存在或已完成')

  const missing = []
  let total = 0
  for (let i = 0; i < upload.total_chunks; i += 1) {
    try {
      const stat = await fsp.stat(partPath(id, i))
      total += stat.size
    } catch {
      missing.push(i)
    }
  }

  if (missing.length > 0) {
    return reject(res, 400, `缺少分片：${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ' …' : ''}`)
  }
  if (total !== upload.size) {
    return reject(res, 400, `分片总大小 ${total}B 与声明的 ${upload.size}B 不一致`)
  }

  // 只保留扩展名里的字母数字和点，避免拼出意外路径
  const ext = path.extname(upload.name).replace(/[^.a-zA-Z0-9]/g, '').slice(0, 16)
  const finalPath = path.join(UPLOAD_DIR, `${id}${ext}`)

  const writeStream = fs.createWriteStream(finalPath)
  try {
    for (let i = 0; i < upload.total_chunks; i += 1) {
      const partStream = fs.createReadStream(partPath(id, i))
      for await (const chunk of partStream) {
        if (!writeStream.write(chunk)) {
          await once(writeStream, 'drain')
        }
      }
    }
    await new Promise((resolve, rejectPromise) => {
      writeStream.on('error', rejectPromise)
      writeStream.end(resolve)
    })
  } catch (error) {
    writeStream.destroy()
    throw error
  }

  const { size } = await fsp.stat(finalPath)
  const uploadedAt = new Date().toISOString()

  db.prepare(
    'INSERT INTO files (id, name, size, mime, path, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, upload.name, size, upload.mime, finalPath, uploadedAt)
  db.prepare('DELETE FROM uploads WHERE id = ?').run(id)
  await fsp.rm(chunkDirOf(id), { recursive: true, force: true })

  console.log(`[upload] complete ${id} -> ${finalPath} (${size}B)`)
  res.status(201).json({ fileId: id, name: upload.name, size, mime: upload.mime, uploadedAt })
})

/* ---------- 4. 读取文件内容（支持 Range，供 PDF 预览） ---------- */

filesRouter.get('/files/:id/content', async (req, res) => {
  const { id } = req.params
  if (!ID_RE.test(id)) return reject(res, 400, 'fileId 不合法')

  const row = db.prepare('SELECT * FROM files WHERE id = ?').get(id)
  if (!row) return reject(res, 404, '文件不存在')

  let stat
  try {
    stat = await fsp.stat(row.path)
  } catch {
    return reject(res, 404, '文件已丢失')
  }

  const inline = INLINE_MIME.has(row.mime)
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  // 非白名单类型一律按二进制下载，避免上传的 HTML/SVG 在同源下执行脚本
  res.setHeader('Content-Type', inline ? row.mime : 'application/octet-stream')
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeFilename(row.name)}`,
  )
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate')

  const range = req.headers.range
  if (!range) {
    res.setHeader('Content-Length', String(stat.size))
    fs.createReadStream(row.path).pipe(res)
    return
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  if (!match) {
    res.status(416)
    res.setHeader('Content-Range', `bytes */${stat.size}`)
    res.end()
    return
  }

  let start = match[1] === '' ? Number.NaN : Number(match[1])
  let end = match[2] === '' ? Number.NaN : Number(match[2])

  if (Number.isNaN(start)) {
    // 后缀区间：bytes=-500 表示最后 500 字节
    start = Math.max(0, stat.size - end)
    end = stat.size - 1
  } else if (Number.isNaN(end)) {
    end = stat.size - 1
  }

  if (start > end || start >= stat.size || start < 0) {
    res.status(416)
    res.setHeader('Content-Range', `bytes */${stat.size}`)
    res.end()
    return
  }

  end = Math.min(end, stat.size - 1)
  res.status(206)
  res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
  res.setHeader('Content-Length', String(end - start + 1))
  fs.createReadStream(row.path, { start, end }).pipe(res)
})

/* ---------- 5. 删除文件（含未完成的上传任务） ---------- */

filesRouter.delete('/files/:id', async (req, res) => {
  const { id } = req.params
  if (!ID_RE.test(id)) return reject(res, 400, 'fileId 不合法')

  const fileRow = db.prepare('SELECT * FROM files WHERE id = ?').get(id)
  const uploadRow = db.prepare('SELECT * FROM uploads WHERE id = ?').get(id)
  if (!fileRow && !uploadRow) return reject(res, 404, '文件不存在')

  if (fileRow) {
    await fsp.rm(fileRow.path, { force: true })
    db.prepare('DELETE FROM files WHERE id = ?').run(id)
  }
  if (uploadRow) {
    db.prepare('DELETE FROM uploads WHERE id = ?').run(id)
  }
  // 取消上传时可能还有分片正在写盘（Windows 上句柄占用会让删除失败），重试几次
  await fsp.rm(chunkDirOf(id), { recursive: true, force: true, maxRetries: 5, retryDelay: 120 })

  console.log(`[upload] delete ${id}`)
  res.status(204).end()
})

/* ---------- 启动时清理过期上传 ---------- */

/**
 * 两轮清理：
 * 1. uploads 表里超期的任务（用户传一半就跑了）→ 删行 + 删分片目录；
 * 2. 没有对应行的残留目录（删除时文件被占用之类）→ 按目录 mtime 超期后删。
 * 只做第 2 轮是不够的：有行存在时旧实现会直接 continue，导致分片永远清不掉。
 */
export async function cleanupOrphanChunks() {
  const cutoff = new Date(Date.now() - ORPHAN_TTL_MS).toISOString()
  const stale = db.prepare('SELECT id FROM uploads WHERE created_at < ?').all(cutoff)

  let removed = 0

  for (const row of stale) {
    db.prepare('DELETE FROM uploads WHERE id = ?').run(row.id)
    await fsp.rm(chunkDirOf(row.id), { recursive: true, force: true })
    removed += 1
  }

  let entries = []
  try {
    entries = await fsp.readdir(CHUNK_DIR)
  } catch {
    return removed
  }

  const now = Date.now()
  for (const entry of entries) {
    const dir = path.join(CHUNK_DIR, entry)
    try {
      const stat = await fsp.stat(dir)
      if (!stat.isDirectory()) continue
      if (now - stat.mtimeMs < ORPHAN_TTL_MS) continue
      if (db.prepare('SELECT 1 AS hit FROM uploads WHERE id = ?').get(entry)) continue
      await fsp.rm(dir, { recursive: true, force: true })
      removed += 1
    } catch {
      // 单个目录清理失败不影响启动
    }
  }

  return removed
}
