import type { StoredFile } from './types'

const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i

type FileLike = Pick<StoredFile, 'mime' | 'name'>

/** 浏览器能直接渲染的位图类型（SVG 不算，避免脚本执行） */
export function isImage(file: FileLike) {
  return IMAGE_MIME.has(file.mime) || IMAGE_EXT.test(file.name)
}

export function isPdf(file: FileLike) {
  return file.mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function isPreviewable(file: FileLike) {
  return isPdf(file) || isImage(file)
}
