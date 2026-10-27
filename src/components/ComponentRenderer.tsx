import type { ComponentNode, StoredFile } from '../types'
import { ButtonBlock } from './blocks/ButtonBlock'
import { HeadingBlock } from './blocks/HeadingBlock'
import { ImageBlock } from './blocks/ImageBlock'
import { InputBlock } from './blocks/InputBlock'
import { FileUploadBlock } from './FileUploadBlock'

interface Props {
  node: ComponentNode
  onFileChange: (nodeId: string, file: StoredFile | null) => void
}

export function ComponentRenderer({ node, onFileChange }: Props) {
  switch (node.type) {
    case 'file-upload':
      return <FileUploadBlock node={node} onFileChange={onFileChange} />
    case 'heading':
      return <HeadingBlock node={node} />
    case 'image':
      return <ImageBlock node={node} />
    case 'button':
      return <ButtonBlock node={node} />
    case 'input':
      return <InputBlock node={node} />
  }
}
