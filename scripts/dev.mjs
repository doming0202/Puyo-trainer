import { spawn } from 'node:child_process'

function spawnPnpm(args) {
  if (process.platform === 'win32') {
    const comspec = process.env.ComSpec || 'cmd.exe'
    return spawn(comspec, ['/d', '/s', '/c', `pnpm.cmd ${args.join(' ')}`], { stdio: 'inherit' })
  }
  return spawn('pnpm', args, { stdio: 'inherit' })
}

const children = [
  spawnPnpm(['run', 'dev:client']),
  spawnPnpm(['run', 'dev:room']),
]

let shuttingDown = false
const shutdown = (code = 0) => {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) child.kill()
  process.exit(code)
}

for (const child of children) {
  child.on('error', (error) => {
    console.error(error)
    shutdown(1)
  })
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    if (signal) shutdown(0)
    if (code !== 0) shutdown(code ?? 1)
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
