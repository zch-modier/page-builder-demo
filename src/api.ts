import type { PageSchema } from './types'

export interface PageResponse {
  key: string
  schema: PageSchema
  updatedAt: string | null
}

export const PAGE_KEY = 'default'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export function fetchPage(): Promise<PageResponse> {
  return request<PageResponse>(`/api/pages/${PAGE_KEY}`)
}

export function putPage(schema: PageSchema): Promise<PageResponse> {
  return request<PageResponse>(`/api/pages/${PAGE_KEY}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schema }),
  })
}

export function fileUrl(fileId: string): string {
  return `/api/files/${fileId}/content`
}