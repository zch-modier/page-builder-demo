import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const children = []
let closing = false

function shutdown(code) {
  if (closing) return
  closing = true
  for (const child of children) {
    if (!child.killed) child.kill()
  }
  process.exit(code)
}

function run(name, args) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' })
  child.on('exit', (code, signal) => {
    if (!closing) console.log(`[${name}] exited (code=${code} signal=${signal})`)
    shutdown(code ?? 0)
  })
  children.push(child)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

run('server', ['server/index.mjs'])
run('web', ['node_modules/vite/bin/vite.js'])