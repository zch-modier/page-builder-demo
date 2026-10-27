export type ComponentType = 'file-upload' | 'heading' | 'image' | 'button' | 'input'

export interface StoredFile {
  fileId: string
  name: string
  size: number
  mime: string
  uploadedAt: string
}

export interface FileUploadProps {
  title: string
  file: StoredFile | null
}

export interface HeadingProps {
  text: string
  level: 1 | 2 | 3
  align: 'left' | 'center' | 'right'
}

export interface ImageProps {
  url: string
  file: StoredFile | null
  alt: string
}

export interface ButtonProps {
  text: string
  variant: 'primary' | 'default' | 'link'
  href: string
}

export interface InputProps {
  label: string
  placeholder: string
  required: boolean
}

interface BaseNode<T extends ComponentType, P> {
  id: string
  type: T
  props: P
}

export type FileUploadNode = BaseNode<'file-upload', FileUploadProps>
export type HeadingNode = BaseNode<'heading', HeadingProps>
export type ImageNode = BaseNode<'image', ImageProps>
export type ButtonNode = BaseNode<'button', ButtonProps>
export type InputNode = BaseNode<'input', InputProps>

export type ComponentNode = FileUploadNode | HeadingNode | ImageNode | ButtonNode | InputNode

export interface PageSchema {
  version: 1
  title: string
  components: ComponentNode[]
}
