import { useCallback, useEffect, useRef, useState } from 'react'
import { App as AntApp, Button, Layout, Space, Tag, Typography } from 'antd'
import { AppstoreOutlined, SaveOutlined } from '@ant-design/icons'
import { fetchPage, putPage } from './api'
import { Canvas } from './components/Canvas'
import { Palette } from './components/Palette'
import { SettingsDrawer } from './components/SettingsDrawer'
import { createNode } from './registry'
import type { ComponentNode, ComponentType, PageSchema, StoredFile } from './types'

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

const TAG_COLOR: Record<Exclude<SaveState, 'idle'>, string> = {
  dirty: 'warning',
  saving: 'processing',
  saved: 'success',
  error: 'error',
}

const STATUS_TEXT: Record<Exclude<SaveState, 'idle'>, string> = {
  dirty: '有未保存的修改',
  saving: '保存中',
  saved: '已保存',
  error: '保存失败',
}


function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export default function App() {
  const { message } = AntApp.useApp()

  const [schema, setSchema] = useState<PageSchema | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveDetail, setSaveDetail] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const schemaRef = useRef<PageSchema | null>(null)

  useEffect(() => {
    schemaRef.current = schema
  }, [schema])

  useEffect(() => {
    let alive = true
    fetchPage()
      .then((page) => {
        if (!alive) return
        setSchema({
          version: 1,
          title: page.schema.title || '未命名页面',
          components: Array.isArray(page.schema.components) ? page.schema.components : [],
        })
      })
      .catch((error: unknown) => {
        if (alive) setLoadError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const mutate = useCallback((fn: (draft: PageSchema) => PageSchema) => {
    setSchema((prev) => (prev ? fn(prev) : prev))
    setSaveState('dirty')
    setSaveDetail(null)
  }, [])

  const handleInsert = useCallback(
    (type: ComponentType, index: number) => {
      mutate((prev) => {
        const components = [...prev.components]
        components.splice(clamp(index, 0, components.length), 0, createNode(type))
        return { ...prev, components }
      })
    },
    [mutate],
  )

  const handleMove = useCallback(
    (from: number, insertAt: number) => {
      mutate((prev) => {
        if (from < 0 || from >= prev.components.length) return prev
        const components = [...prev.components]
        const [node] = components.splice(from, 1)
        const target = insertAt > from ? insertAt - 1 : insertAt
        components.splice(clamp(target, 0, components.length), 0, node)
        return { ...prev, components }
      })
    },
    [mutate],
  )

  const handleRemove = useCallback(
    (id: string) => {
      mutate((prev) => ({
        ...prev,
        components: prev.components.filter((item) => item.id !== id),
      }))
      if (selectedId === id) {
        setSelectedId(null)
        setSettingsOpen(false)
      }
    },
    [mutate, selectedId],
  )

  const updateNodeProps = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      mutate((prev) => ({
        ...prev,
        components: prev.components.map((node) =>
          node.id === id
            ? // 属性面板是动态表单，patch 形状由节点类型决定，这里只能宽松处理
              ({ ...node, props: { ...node.props, ...patch } } as unknown as ComponentNode)
            : node,
        ),
      }))
    },
    [mutate],
  )

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
  }, [])

  const handleOpenSettings = useCallback((id: string) => {
    setSelectedId(id)
    setSettingsOpen(true)
  }, [])

  // 保存串行化：并发 PUT 会互相覆盖（后到者胜），这里保证同一时刻只有一次在飞，
  // 飞行期间的新变更只保留最后一版，等上一次结束再发。
  const saveQueue = useRef<{ latest: PageSchema | null; running: boolean }>({
    latest: null,
    running: false,
  })

  const drainSaveQueue = useCallback(async () => {
    const queue = saveQueue.current
    if (queue.running) return

    queue.running = true
    try {
      while (queue.latest) {
        const payload = queue.latest
        queue.latest = null

        setSaveState('saving')
        setSaveDetail(null)

        try {
          const saved = await putPage(payload)
          if (!queue.latest) {
            setSaveState('saved')
            setSaveDetail(new Date(saved.updatedAt ?? Date.now()).toLocaleTimeString('zh-CN'))
          }
        } catch (error) {
          setSaveState('error')
          setSaveDetail(error instanceof Error ? error.message : String(error))
          message.error('保存失败，请检查后端是否在运行')
        }
      }
    } finally {
      queue.running = false
    }
  }, [message])

  const persist = useCallback(
    (next: PageSchema) => {
      saveQueue.current.latest = next
      void drainSaveQueue()
    },
    [drainSaveQueue],
  )

  const handleSave = useCallback(() => {
    if (schema) persist(schema)
  }, [persist, schema])

  // 上传完成 / 删除文件后立刻写回服务端，保证"关掉再打开文件还在"
  const handleFileChange = useCallback(
    (nodeId: string, file: StoredFile | null) => {
      const current = schemaRef.current
      if (!current) return
      const next: PageSchema = {
        ...current,
        components: current.components.map((node) =>
          node.id === nodeId
            ? ({ ...node, props: { ...node.props, file } } as unknown as ComponentNode)
            : node,
        ),
      }
      setSchema(next)
      void persist(next)
    },
    [persist],
  )

  if (loading) {
    return (
      <div className="boot">
        <Typography.Text type="secondary">正在加载页面数据…</Typography.Text>
      </div>
    )
  }

  if (loadError || !schema) {
    return (
      <div className="boot">
        <Space orientation="vertical" align="center">
          <Typography.Text type="danger">加载失败：{loadError}</Typography.Text>
          <Typography.Text type="secondary">请确认后端已启动（npm run dev 会同时起前后端）</Typography.Text>
        </Space>
      </div>
    )
  }

  return (
    <Layout className="shell">
      <Layout.Header className="appHeader">
        <div className="brand">
          <span className="brandIcon">
            <AppstoreOutlined />
          </span>
          <div>
            <Typography.Text strong style={{ fontSize: 15 }}>
              {schema.title}
            </Typography.Text>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                schema 驱动的页面搭建器 · demo
              </Typography.Text>
            </div>
          </div>
        </div>

        <Space size={12}>
          {saveState !== 'idle' && (
            <Tag color={TAG_COLOR[saveState]} style={{ marginInlineEnd: 0 }}>
              {STATUS_TEXT[saveState]}
              {saveDetail && saveState !== 'saving' ? ` · ${saveDetail}` : ''}
            </Tag>
          )}
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saveState === 'saving'}
            onClick={handleSave}
          >
            保存
          </Button>
        </Space>
      </Layout.Header>

      <Layout>
        <Layout.Content className="canvasArea">
          <Canvas
            components={schema.components}
            selectedId={selectedId}
            onInsert={handleInsert}
            onMove={handleMove}
            onRemove={handleRemove}
            onSelect={handleSelect}
            onOpenSettings={handleOpenSettings}
            onFileChange={handleFileChange}
          />
        </Layout.Content>

        <Layout.Sider width={232} theme="light" className="panel">
          <Palette onAdd={(type) => handleInsert(type, schema.components.length)} />
        </Layout.Sider>
      </Layout>

      <SettingsDrawer
        node={schema.components.find((node) => node.id === selectedId) ?? null}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onPatch={(patch) => {
          if (selectedId) updateNodeProps(selectedId, patch)
        }}
      />

      <Layout.Footer className="appFooter">
        <span>组件 {schema.components.length} 个</span>
        <span>schema v{schema.version}</span>
        <span className="footerHint">
          编辑后点「保存」写回服务端；上传/删除文件会自动保存
        </span>
      </Layout.Footer>
    </Layout>
  )
}
