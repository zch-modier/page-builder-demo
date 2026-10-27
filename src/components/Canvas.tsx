import { useState } from 'react'
import { Button, Card, Empty, Space, Typography } from 'antd'
import { DeleteOutlined, HolderOutlined, SettingOutlined } from '@ant-design/icons'
import type { ComponentNode, StoredFile } from '../types'
import { ComponentRenderer } from './ComponentRenderer'

export const NEW_COMPONENT_MIME = 'application/x-pb-new'
export const MOVE_COMPONENT_MIME = 'application/x-pb-move'

interface Props {
  components: ComponentNode[]
  selectedId: string | null
  onInsert: (type: ComponentNode['type'], index: number) => void
  onMove: (from: number, insertAt: number) => void
  onRemove: (id: string) => void
  onSelect: (id: string) => void
  onOpenSettings: (id: string) => void
  onFileChange: (nodeId: string, file: StoredFile | null) => void
}

function hasPayload(dataTransfer: DataTransfer) {
  return (
    dataTransfer.types.includes(NEW_COMPONENT_MIME) ||
    dataTransfer.types.includes(MOVE_COMPONENT_MIME)
  )
}

export function Canvas({
  components,
  selectedId,
  onInsert,
  onMove,
  onRemove,
  onSelect,
  onOpenSettings,
  onFileChange,
}: Props) {
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    const target = dropIndex ?? components.length
    const newType = event.dataTransfer.getData(NEW_COMPONENT_MIME)
    const moveFrom = event.dataTransfer.getData(MOVE_COMPONENT_MIME)

    setDropIndex(null)
    setDraggingId(null)

    if (newType) {
      onInsert(newType as ComponentNode['type'], target)
    } else if (moveFrom !== '') {
      onMove(Number(moveFrom), target)
    }
  }

  return (
    <div
      className="canvasRoot"
      onDragOver={(event) => {
        if (!hasPayload(event.dataTransfer)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = event.dataTransfer.types.includes(NEW_COMPONENT_MIME)
          ? 'copy'
          : 'move'
        setDropIndex(components.length)
      }}
      onDrop={handleDrop}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        setDropIndex(null)
      }}
    >
      {components.length === 0 && (
        <div className="canvasEmpty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span>
                把右侧的组件拖到这里
                <br />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  页面内容会保存到服务端，下次打开还在
                </Typography.Text>
              </span>
            }
          />
        </div>
      )}

      <div className="canvasList">
        {components.map((node, index) => (
          <div key={node.id} className="canvasRow">
            {dropIndex === index && <div className="dropLine" />}

            <div
              className={[
                'blockWrap',
                draggingId === node.id ? 'isDragging' : '',
                selectedId === node.id ? 'isSelected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              draggable
              onClick={() => onSelect(node.id)}
              onDragStart={(event) => {
                event.dataTransfer.setData(MOVE_COMPONENT_MIME, String(index))
                event.dataTransfer.effectAllowed = 'move'
                setDraggingId(node.id)
              }}
              onDragEnd={() => {
                setDraggingId(null)
                setDropIndex(null)
              }}
              onDragOver={(event) => {
                if (!hasPayload(event.dataTransfer)) return
                event.preventDefault()
                event.stopPropagation()
                const rect = event.currentTarget.getBoundingClientRect()
                const isBefore = event.clientY < rect.top + rect.height / 2
                setDropIndex(isBefore ? index : index + 1)
              }}
            >
              <Card size="small" styles={{ body: { padding: '4px 14px 14px' } }}>
                <div className="blockBar">
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    <HolderOutlined /> 拖动排序
                  </Typography.Text>

                  <Space size={2}>
                    <Button
                      size="small"
                      type="text"
                      icon={<SettingOutlined />}
                      draggable={false}
                      onDragStart={(event) => event.preventDefault()}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        onOpenSettings(node.id)
                      }}
                    />
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      draggable={false}
                      onDragStart={(event) => event.preventDefault()}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        onRemove(node.id)
                      }}
                    />
                  </Space>
                </div>

                <ComponentRenderer node={node} onFileChange={onFileChange} />
              </Card>
            </div>
          </div>
        ))}

        {dropIndex === components.length && components.length > 0 && <div className="dropLine" />}
      </div>
    </div>
  )
}
