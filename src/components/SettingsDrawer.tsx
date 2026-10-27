import { useRef, useState } from 'react'
import {
  Button,
  Divider,
  Drawer,
  Form,
  Image,
  Input,
  Progress,
  Segmented,
  Select,
  Switch,
  Typography,
} from 'antd'
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons'
import { fileUrl } from '../api'
import { isImage } from '../fileKind'
import { COMPONENT_META } from '../registry'
import type { ComponentNode, ImageNode, StoredFile } from '../types'
import { deleteFile, uploadFileInChunks } from '../upload'

interface Props {
  node: ComponentNode | null
  open: boolean
  onClose: () => void
  onPatch: (patch: Record<string, unknown>) => void
}

export function SettingsDrawer({ node, open, onClose, onPatch }: Props) {
  const meta = node ? COMPONENT_META.find((item) => item.type === node.type) : null

  return (
    <Drawer
      open={open && Boolean(node)}
      onClose={onClose}
      width={340}
      mask={false}
      title={meta ? `设置 · ${meta.label}` : '设置'}
      styles={{ body: { paddingTop: 12 } }}
    >
      {node && <SettingsForm node={node} onPatch={onPatch} />}
    </Drawer>
  )
}

interface FormProps {
  node: ComponentNode
  onPatch: (patch: Record<string, unknown>) => void
}

function SettingsForm({ node, onPatch }: FormProps) {
  switch (node.type) {
    case 'file-upload':
      return (
        <Form layout="vertical" size="small">
          <Form.Item label="标题" style={{ marginBottom: 8 }}>
            <Input
              value={node.props.title}
              onChange={(event) => onPatch({ title: event.target.value })}
            />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            上传区在画布里操作，这里只改标题。
          </Typography.Text>
          <NodeId id={node.id} />
        </Form>
      )

    case 'heading':
      return (
        <Form layout="vertical" size="small">
          <Form.Item label="文字" style={{ marginBottom: 12 }}>
            <Input
              value={node.props.text}
              onChange={(event) => onPatch({ text: event.target.value })}
            />
          </Form.Item>
          <Form.Item label="级别" style={{ marginBottom: 12 }}>
            <Segmented
              value={String(node.props.level)}
              options={[
                { label: '一级', value: '1' },
                { label: '二级', value: '2' },
                { label: '三级', value: '3' },
              ]}
              onChange={(value) => onPatch({ level: Number(value) })}
            />
          </Form.Item>
          <Form.Item label="对齐" style={{ marginBottom: 12 }}>
            <Segmented
              value={node.props.align}
              options={[
                { label: '左', value: 'left' },
                { label: '中', value: 'center' },
                { label: '右', value: 'right' },
              ]}
              onChange={(value) => onPatch({ align: value })}
            />
          </Form.Item>
          <NodeId id={node.id} />
        </Form>
      )

    case 'image':
      return (
        <Form layout="vertical" size="small">
          <ImageSourceField node={node} onPatch={onPatch} />
          <Form.Item label="替代文字（alt）" style={{ marginTop: 12, marginBottom: 8 }}>
            <Input
              value={node.props.alt}
              onChange={(event) => onPatch({ alt: event.target.value })}
            />
          </Form.Item>
          <NodeId id={node.id} />
        </Form>
      )

    case 'button':
      return (
        <Form layout="vertical" size="small">
          <Form.Item label="文案" style={{ marginBottom: 12 }}>
            <Input
              value={node.props.text}
              onChange={(event) => onPatch({ text: event.target.value })}
            />
          </Form.Item>
          <Form.Item label="样式" style={{ marginBottom: 12 }}>
            <Select
              value={node.props.variant}
              options={[
                { label: '主要按钮', value: 'primary' },
                { label: '次要按钮', value: 'default' },
                { label: '文字按钮', value: 'link' },
              ]}
              onChange={(value) => onPatch({ variant: value })}
            />
          </Form.Item>
          <Form.Item label="跳转链接" style={{ marginBottom: 8 }}>
            <Input
              placeholder="https://…（可留空）"
              value={node.props.href}
              onChange={(event) => onPatch({ href: event.target.value })}
            />
          </Form.Item>
          <NodeId id={node.id} />
        </Form>
      )

    case 'input':
      return (
        <Form layout="vertical" size="small">
          <Form.Item label="字段名" style={{ marginBottom: 12 }}>
            <Input
              value={node.props.label}
              onChange={(event) => onPatch({ label: event.target.value })}
            />
          </Form.Item>
          <Form.Item label="占位提示" style={{ marginBottom: 12 }}>
            <Input
              value={node.props.placeholder}
              onChange={(event) => onPatch({ placeholder: event.target.value })}
            />
          </Form.Item>
          <Form.Item label="必填" style={{ marginBottom: 8 }}>
            <Switch
              checked={node.props.required}
              onChange={(checked) => onPatch({ required: checked })}
            />
          </Form.Item>
          <NodeId id={node.id} />
        </Form>
      )
  }
}

function NodeId({ id }: { id: string }) {
  return (
    <Typography.Text type="secondary" style={{ fontSize: 11, wordBreak: 'break-all' }}>
      id: {id}
    </Typography.Text>
  )
}

/* ---------- 图片：链接 或 上传 ---------- */

function ImageSourceField({
  node,
  onPatch,
}: {
  node: ImageNode
  onPatch: (patch: Record<string, unknown>) => void
}) {
  const { file, url } = node.props
  const [percent, setPercent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const sessionRef = useRef<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function discard() {
    const id = sessionRef.current
    sessionRef.current = null
    if (id) void deleteFile(id).catch(() => {})
  }

  async function start(picked: File) {
    if (!isImage({ mime: picked.type, name: picked.name })) {
      setError('只能上传 PNG / JPEG / GIF / WebP')
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setError(null)
    setPercent(0)

    try {
      const meta: StoredFile = await uploadFileInChunks(
        picked,
        (progress) => setPercent(progress.percent),
        controller.signal,
        (fileId) => {
          sessionRef.current = fileId
        },
      )
      sessionRef.current = null
      onPatch({ file: meta, url: '' })
      setPercent(null)
    } catch (err) {
      discard()
      setPercent(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      abortRef.current = null
    }
  }

  return (
    <>
      <Form.Item label="图片链接" style={{ marginBottom: 8 }}>
        <Input
          placeholder="https://…"
          value={url}
          disabled={Boolean(file)}
          onChange={(event) => onPatch({ url: event.target.value, file: null })}
        />
      </Form.Item>

      <Divider plain style={{ margin: '4px 0 10px', fontSize: 12 }}>
        或
      </Divider>

      {file ? (
        <div className="drawerFile">
          <Image
            src={fileUrl(file.fileId)}
            width={40}
            height={40}
            preview={false}
            style={{ objectFit: 'cover', borderRadius: 4 }}
          />
          <Typography.Text ellipsis style={{ flex: 1, fontSize: 12 }}>
            {file.name}
          </Typography.Text>
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              const id = file.fileId
              onPatch({ file: null })
              void deleteFile(id).catch(() => {})
            }}
          />
        </div>
      ) : (
        <Button
          block
          icon={<UploadOutlined />}
          loading={percent !== null}
          onClick={() => inputRef.current?.click()}
        >
          上传图片
        </Button>
      )}

      {percent !== null && <Progress percent={percent} size="small" style={{ marginTop: 10 }} />}
      {error && (
        <Typography.Text type="danger" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          {error}
        </Typography.Text>
      )}

      <input
        ref={inputRef}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={(event) => {
          const picked = event.target.files?.[0]
          event.target.value = ''
          if (picked) void start(picked)
        }}
      />
    </>
  )
}
