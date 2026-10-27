import type { ReactNode } from 'react'
import {
  BorderOutlined,
  FileAddOutlined,
  FontSizeOutlined,
  FormOutlined,
  PictureOutlined,
} from '@ant-design/icons'
import type { ComponentNode, ComponentType } from './types'

export interface ComponentMeta {
  type: ComponentType
  label: string
  hint: string
  icon: ReactNode
}

export const COMPONENT_META: ComponentMeta[] = [
  { type: 'file-upload', label: '文件上传', hint: '切片上传 · PDF 预览', icon: <FileAddOutlined /> },
  { type: 'heading', label: '标题', hint: '一 / 二 / 三级标题', icon: <FontSizeOutlined /> },
  { type: 'image', label: '图片', hint: '上传或填链接 · 可放大', icon: <PictureOutlined /> },
  { type: 'button', label: '按钮', hint: '主要 / 次要 / 文字', icon: <BorderOutlined /> },
  { type: 'input', label: '单行输入框', hint: '带 label 与占位符', icon: <FormOutlined /> },
]

/** 非安全上下文（例如用局域网 IP 打开）没有 crypto.randomUUID，这里兜底 */
export function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

export function createNode(type: ComponentType): ComponentNode {
  const id = createId()

  switch (type) {
    case 'file-upload':
      return { id, type, props: { title: '文件上传', file: null } }
    case 'heading':
      return { id, type, props: { text: '未命名标题', level: 2, align: 'left' } }
    case 'image':
      return { id, type, props: { url: '', file: null, alt: '图片' } }
    case 'button':
      return { id, type, props: { text: '按钮', variant: 'primary', href: '' } }
    case 'input':
      return { id, type, props: { label: '字段名', placeholder: '请输入', required: false } }
  }
}
