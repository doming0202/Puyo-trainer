import { spawn } from 'node:child_process'

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const children = [
  spawn(command, ['run', 'dev:client'], { stdio: 'inherit' }),
  spawn(command, ['run', 'dev:room'], { stdio: 'inherit' }),
]

let shuttingDown = false
const shutdown = (code = 0) => {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) child.kill('SIGTERM')
  process.exit(code)
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    if (signal) shutdown(0)
    if (code !== 0) shutdown(code ?? 1)
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
