import { useRef, useState } from 'react'
import { Button, Card, Image, Progress, Space, Tag, Typography } from 'antd'
import {
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileOutlined,
  FilePdfOutlined,
  InboxOutlined,
} from '@ant-design/icons'
import { fileUrl } from '../api'
import { isImage, isPdf } from '../fileKind'
import type { FileUploadNode, StoredFile } from '../types'
import { deleteFile, uploadFileInChunks, type UploadProgress } from '../upload'
import { PreviewModal } from './PreviewModal'

interface Props {
  node: FileUploadNode
  onFileChange: (nodeId: string, file: StoredFile | null) => void
}

type Phase = 'idle' | 'uploading' | 'error'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}

export function FileUploadBlock({ node, onFileChange }: Props) {
  const file = node.props.file

  const [phase, setPhase] = useState<Phase>('idle')
  const [percent, setPercent] = useState(0)
  const [uploadedBytes, setUploadedBytes] = useState(0)
  const [totalBytes, setTotalBytes] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [previewing, setPreviewing] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const sessionRef = useRef<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /** 放弃当前上传任务：通知服务端删掉半成品分片，避免残留 */
  function discardSession() {
    const fileId = sessionRef.current
    sessionRef.current = null
    if (!fileId) return
    // 稍等一拍，让被 abort 的分片请求先结束，服务端删目录时不容易撞上写句柄
    window.setTimeout(() => {
      void deleteFile(fileId).catch(() => {})
    }, 300)
  }

  async function start(picked: File) {
    if (picked.size === 0) {
      setPhase('error')
      setError('空文件无法上传')
      return
    }

    const controller = new AbortController()
    abortRef.current = controller

    setPhase('uploading')
    setPercent(0)
    setUploadedBytes(0)
    setTotalBytes(picked.size)
    setError(null)

    try {
      const meta = await uploadFileInChunks(
        picked,
        (progress: UploadProgress) => {
          setPercent(progress.percent)
          setUploadedBytes(progress.uploaded)
        },
        controller.signal,
        (fileId) => {
          sessionRef.current = fileId
        },
      )
      sessionRef.current = null
      onFileChange(node.id, meta)
      setPhase('idle')
    } catch (err) {
      discardSession()
      if (controller.signal.aborted) {
        setPhase('idle')
        return
      }
      setPhase('error')
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      abortRef.current = null
    }
  }

  function cancel() {
    abortRef.current?.abort()
    discardSession()
    setPhase('idle')
    setPercent(0)
    setUploadedBytes(0)
  }

  function remove() {
    if (!file) return
    onFileChange(node.id, null)
    void deleteFile(file.fileId).catch(() => {
      // 服务端删除失败不阻断用户：schema 已清空，下次打开不会出现该文件
    })
  }

  const head = (
    <Space size={8}>
      <Typography.Text strong>{node.props.title}</Typography.Text>
      {file ? <Tag color="success">已上传</Tag> : <Tag color="blue">切片上传</Tag>}
    </Space>
  )

  if (file) {
    return (
      <div>
        <div className="uploadHead">{head}</div>

        <Card size="small" style={{ background: '#fafafa' }}>
          <div className="fileRow">
            {isImage(file) ? (
              <Image
                src={fileUrl(file.fileId)}
                alt={file.name}
                width={40}
                height={40}
                style={{ objectFit: 'cover', borderRadius: 6 }}
              />
            ) : (
              <span className={`fileIcon${isPdf(file) ? ' fileIcon--pdf' : ''}`}>
                {isPdf(file) ? <FilePdfOutlined /> : <FileOutlined />}
              </span>
            )}

            <div className="fileMeta">
              <Typography.Text strong ellipsis={{ tooltip: file.name }} style={{ maxWidth: 460 }}>
                {file.name}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {formatBytes(file.size)} · {new Date(file.uploadedAt).toLocaleString('zh-CN')}
              </Typography.Text>
            </div>

            <Space size={0}>
              {isPdf(file) && (
                <Button
                  type="link"
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => setPreviewing(true)}
                >
                  预览
                </Button>
              )}
              <Button
                type="link"
                size="small"
                icon={<DownloadOutlined />}
                href={fileUrl(file.fileId)}
                download={file.name}
              >
                下载
              </Button>
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={remove}
              >
                删除
              </Button>
            </Space>
          </div>
        </Card>

        {previewing && <PreviewModal file={file} onClose={() => setPreviewing(false)} />}
      </div>
    )
  }

  return (
    <div>
      <div className="uploadHead">{head}</div>

      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(event) => {
          const picked = event.target.files?.[0]
          event.target.value = ''
          if (picked) void start(picked)
        }}
      />

      {phase === 'uploading' ? (
        <Card size="small" style={{ background: '#fafafa' }}>
          <div className="progressHead">
            <Typography.Text
              strong
              style={{ color: 'var(--ant-color-primary, #1677ff)', fontSize: 16 }}
            >
              {percent}%
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}
            </Typography.Text>
          </div>

          <Progress percent={percent} showInfo={false} />

          <div className="progressFoot">
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              分片上传中，请勿关闭页面
            </Typography.Text>
            <Button type="link" size="small" onClick={cancel}>
              取消
            </Button>
          </div>
        </Card>
      ) : (
        <div
          className={`dropzone${dragOver ? ' isOver' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return
            event.preventDefault()
            event.stopPropagation()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return
            event.preventDefault()
            event.stopPropagation()
            setDragOver(false)
            const picked = event.dataTransfer.files?.[0]
            if (picked) void start(picked)
          }}
        >
          <InboxOutlined className="dropzoneIcon" />
          <Typography.Text>点击或拖拽文件到此处</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            支持任意类型，PDF 可在线预览 · 5MB 分片
          </Typography.Text>
          {error && (
            <Typography.Text type="danger" style={{ fontSize: 12 }}>
              {error}
            </Typography.Text>
          )}
        </div>
      )}
    </div>
  )
}
