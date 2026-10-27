import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { ROOT, getPage, savePage } from './db.mjs'
import { cleanupOrphanChunks, filesRouter } from './files.mjs'

const app = express()
const PORT = Number(process.env.PORT ?? 3001)

app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() })
})

app.get('/api/pages/:key', (req, res) => {
  res.json(getPage(req.params.key))
})

app.put('/api/pages/:key', (req, res) => {
  const schema = req.body?.schema
  if (!schema || !Array.isArray(schema.components)) {
    res.status(400).json({ error: 'schema.components 必须是数组' })
    return
  }
  res.json(savePage(req.params.key, schema))
})

app.use('/api', filesRouter)

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not found' })
})

// 生产模式：构建过 dist/ 就由同一个服务托管前端，单端口即可访问
const distDir = path.join(ROOT, 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
  console.log('[server] serving static frontend from dist/')
}

// 未处理的异常统一返回 JSON，避免前端拿到 HTML 错误页
app.use((error, req, res, next) => {
  console.error('[server] unhandled error:', error)
  if (res.headersSent) {
    next(error)
    return
  }
  res.status(500).json({ error: error instanceof Error ? error.message : 'internal error' })
})

app.listen(PORT, '127.0.0.1', async () => {
  console.log(`[server] listening on http://127.0.0.1:${PORT}`)
  const removed = await cleanupOrphanChunks()
  if (removed > 0) console.log(`[server] cleaned ${removed} orphan chunk dir(s)`)
})
