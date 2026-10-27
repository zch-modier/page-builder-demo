import { Card, Space, Typography } from 'antd'
import { COMPONENT_META } from '../registry'
import type { ComponentType } from '../types'
import { NEW_COMPONENT_MIME } from './Canvas'

interface Props {
  onAdd: (type: ComponentType) => void
}

export function Palette({ onAdd }: Props) {
  return (
    <div>
      <Typography.Text type="secondary" className="panelTitle">
        组件
      </Typography.Text>

      <Space orientation="vertical" size={8} style={{ width: '100%' }}>
        {COMPONENT_META.map((item) => (
          <div
            key={item.type}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(NEW_COMPONENT_MIME, item.type)
              event.dataTransfer.effectAllowed = 'copy'
            }}
          >
            <Card
              size="small"
              hoverable
              onClick={() => onAdd(item.type)}
              style={{ cursor: 'grab' }}
            >
              <Space size={10}>
                <span className="paletteIcon">{item.icon}</span>
                <span>
                  <Typography.Text strong style={{ display: 'block' }}>
                    {item.label}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {item.hint}
                  </Typography.Text>
                </span>
              </Space>
            </Card>
          </div>
        ))}
      </Space>

      <Typography.Paragraph
        type="secondary"
        style={{ fontSize: 12, marginTop: 14, marginBottom: 0 }}
      >
        拖动到画布，或点击直接添加；选中后可点卡片右上角「设置」改内容
      </Typography.Paragraph>
    </div>
  )
}
