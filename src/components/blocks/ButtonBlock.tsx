import { Button } from 'antd'
import type { ButtonNode } from '../../types'

interface Props {
  node: ButtonNode
}

export function ButtonBlock({ node }: Props) {
  const { text, variant, href } = node.props

  return (
    <Button
      type={variant}
      href={href || undefined}
      // 编辑态不跳出当前页面
      onClick={(event) => {
        if (href) event.preventDefault()
      }}
    >
      {text || '按钮'}
    </Button>
  )
}