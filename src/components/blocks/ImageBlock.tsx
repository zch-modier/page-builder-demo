import { Image, Typography } from 'antd'
import { fileUrl } from '../../api'
import type { ImageNode } from '../../types'

interface Props {
  node: ImageNode
}

export function ImageBlock({ node }: Props) {
  const src = node.props.file ? fileUrl(node.props.file.fileId) : node.props.url

  if (!src) {
    return (
      <div className="imageEmpty">
        <Typography.Text type="secondary">
          图片未设置：点右上角「设置」，上传图片或填写链接
        </Typography.Text>
      </div>
    )
  }

  return (
    <Image
      src={src}
      alt={node.props.alt}
      style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }}
    />
  )
}