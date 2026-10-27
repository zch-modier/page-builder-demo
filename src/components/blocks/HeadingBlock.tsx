import { Typography } from 'antd'
import type { HeadingNode } from '../../types'

interface Props {
  node: HeadingNode
}

export function HeadingBlock({ node }: Props) {
  const { text, level, align } = node.props

  return (
    <Typography.Title level={level} style={{ margin: 0, textAlign: align }}>
      {text || '（空标题）'}
    </Typography.Title>
  )
}