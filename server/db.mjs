import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export const ROOT = path.resolve(here, '..')
export const DATA_DIR = path.join(ROOT, 'data')
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
export const CHUNK_DIR = path.join(DATA_DIR, 'chunks')
export const DIST_DIR = path.join(ROOT, 'dist')

for (const dir of [DATA_DIR, UPLOAD_DIR, CHUNK_DIR]) {
  fs.mkdirSync(dir, { recursive: true })
}

export const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'))

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS pages (
    key TEXT PRIMARY KEY,
    schema TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime TEXT NOT NULL,
    chunk_size INTEGER NOT NULL,
    total_chunks INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
`)

export const DEFAULT_SCHEMA = {
  version: 1,
  title: '未命名页面',
  components: [],
}

export function getPage(key) {
  const row = db.prepare('SELECT schema, updated_at FROM pages WHERE key = ?').get(key)
  if (!row) {
    return { key, schema: structuredClone(DEFAULT_SCHEMA), updatedAt: null }
  }
  return { key, schema: JSON.parse(row.schema), updatedAt: row.updated_at }
}

export function savePage(key, schema) {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO pages (key, schema, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET schema = excluded.schema, updated_at = excluded.updated_at
  `).run(key, JSON.stringify(schema), now)
  return { key, schema, updatedAt: now }
}