import type { StoredFile } from './types'

export const CLIENT_CHUNK_HINT = 5 * 1024 * 1024
const CONCURRENCY = 3
const RETRIES = 2

export interface UploadProgress {
  uploaded: number
  total: number
  percent: number
}

interface InitResponse {
  fileId: string
  chunkSize: number
  totalChunks: number
}

async function ensureOk(res: Response, fallback: string) {
  if (res.ok) return
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  throw new Error(body?.error ?? `${fallback}（HTTP ${res.status}）`)
}

async function putChunk(fileId: string, index: number, blob: Blob, signal: AbortSignal) {
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      const res = await fetch(`/api/files/${fileId}/chunk/${index}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: blob,
        signal,
      })
      await ensureOk(res, `第 ${index + 1} 片上传失败`)
      return
    } catch (error) {
      if (signal.aborted || attempt === RETRIES) throw error
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)))
    }
  }
}

/**
 * 切片上传：先建任务，再并发 PUT 分片，最后让服务端按序合并。
 * 分片大小以服务端返回为准，前端不假设。
 * onSession 会在任务创建后立刻回调 fileId，便于取消时通知服务端清理分片。
 */
export async function uploadFileInChunks(
  file: File,
  onProgress: (progress: UploadProgress) => void,
  signal: AbortSignal,
  onSession?: (fileId: string) => void,
): Promise<StoredFile> {
  const initRes = await fetch('/api/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      mime: file.type || 'application/octet-stream',
    }),
    signal,
  })
  await ensureOk(initRes, '创建上传任务失败')

  const { fileId, chunkSize, totalChunks } = (await initRes.json()) as InitResponse
  onSession?.(fileId)

  let uploaded = 0
  let chunkIndex = 0

  const report = () => {
    onProgress({
      uploaded,
      total: file.size,
      percent: Math.floor((uploaded / file.size) * 100),
    })
  }

  const worker = async () => {
    while (chunkIndex < totalChunks) {
      if (signal.aborted) throw new DOMException('上传已取消', 'AbortError')
      const index = chunkIndex
      chunkIndex += 1

      const start = index * chunkSize
      const blob = file.slice(start, Math.min(start + chunkSize, file.size))
      await putChunk(fileId, index, blob, signal)

      uploaded += blob.size
      report()
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, totalChunks) }, () => worker()),
  )

  const doneRes = await fetch(`/api/files/${fileId}/complete`, { method: 'POST', signal })
  await ensureOk(doneRes, '合并分片失败')

  return (await doneRes.json()) as StoredFile
}

export async function deleteFile(fileId: string) {
  const res = await fetch(`/api/files/${fileId}`, { method: 'DELETE' })
  await ensureOk(res, '删除文件失败')
}
