import { readFileSync, writeFileSync } from 'node:fs'
const path = 'src/components/RoomPanel.tsx'
const before = readFileSync(path, 'utf8')
const needle = 'for (const playerIndex of [0, 1]) {'
if (!before.includes(needle)) throw new Error('player index loop not found')
const after = before.replace(needle, 'for (const playerIndex of [0, 1] as const)')
writeFileSync(path, after, 'utf8')
