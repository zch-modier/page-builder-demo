import { Input, Typography } from 'antd'
import type { InputNode } from '../../types'

interface Props {
  node: InputNode
}

export function InputBlock({ node }: Props) {
  const { label, placeholder, required } = node.props

  return (
    <div className="inputBlock">
      <Typography.Text>
        {label || '字段名'}
        {required && <span className="requiredMark">*</span>}
      </Typography.Text>
      <Input placeholder={placeholder} readOnly />
    </div>
  )
}