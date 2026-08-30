import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..')
const DIST = join(ROOT, 'dist')
const PORT = Number(process.env.PORT || 8787)
const ROOM_TTL_MS = 24 * 60 * 60 * 1000
const MAX_STUDENTS = 8
const rooms = new Map()

function token(size = 24) { return randomBytes(size).toString('base64url') }
function roomId() { return randomBytes(8).toString('base64url') }
function memberId() { return token(12) }
function send(socket, message) { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message)) }
function broadcast(room, message, except) { const raw = JSON.stringify(message); for (const member of room.members) { if (member === except || member.socket.readyState !== member.socket.OPEN) continue; member.socket.send(raw) } }
function focusState(room) { return [...room.focus] }
function broadcastFocusState(room) { broadcast(room, { type: 'focus-state', focus: focusState(room) }) }
function releaseMemberFocus(room, member, notify = true) { let changed = false; for (let index = 0; index < room.focus.length; index += 1) if (room.focus[index] === member.id) { room.focus[index] = null; changed = true }; if (changed && notify) broadcastFocusState(room); return changed }
function sanitizeState(payload) { return payload && typeof payload === 'object' ? payload : null }
function validPlayerIndex(value) { return Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 1 }
function validTimeState(state) { return Boolean(state && typeof state === 'object' && validPlayerIndex(state.playerIndex) && state.player && typeof state.player === 'object' && Number.isFinite(state.tick) && Number.isFinite(state.elapsedMs)) }
function normalizePlayerSync(room, state, member, writePlayer) {
  const index = Number(state.playerIndex)
  const currentGame = room.state?.game
  const clockAuthoritative = member.role === 'coach'
  return {
    ...state,
    playerIndex: index,
    player: writePlayer && state.player ? state.player : currentGame?.players?.[index],
    tick: clockAuthoritative ? Number(state.tick) : Number(currentGame?.tick ?? state.tick),
    activePlayer: clockAuthoritative ? (Number(state.activePlayer) === 1 ? 1 : 0) : (Number(currentGame?.activePlayer) === 1 ? 1 : 0),
    running: clockAuthoritative ? Boolean(state.running) : Boolean(currentGame?.running ?? state.running),
    elapsedMs: clockAuthoritative ? Math.max(0, Number(state.elapsedMs)) : Math.max(0, Number(room.state?.elapsedMs ?? state.elapsedMs)),
  }
}
function mergePlayer(room, state, member, writePlayer) {
  const normalized = normalizePlayerSync(room, state, member, writePlayer)
  const playerIndex = normalized.playerIndex
  if (!room.state?.game?.players?.[playerIndex]) return normalized
  const players = [...room.state.game.players]
  if (normalized.player && writePlayer) players[playerIndex] = { ...players[playerIndex], ...normalized.player }
  room.state = {
    ...room.state,
    game: {
      ...room.state.game,
      players,
      activePlayer: normalized.activePlayer,
      running: normalized.running,
      tick: normalized.tick,
    },
    elapsedMs: normalized.elapsedMs,
  }
  return normalized
}
function removeMember(socket) { const room = socket.room; const member = socket.member; if (!room || !member) return; const focusChanged = releaseMemberFocus(room, member, false); room.members = room.members.filter(item => item !== member); room.lastActiveAt = Date.now(); if (room.members.length === 0) rooms.delete(room.id); else { if (focusChanged) broadcastFocusState(room); broadcast(room, { type: 'presence', studentCount: room.members.filter(item => item.role === 'student').length }) }; socket.room = null; socket.member = null }

function handleMessage(socket, raw) {
  let message
  try { message = JSON.parse(raw.toString()) } catch { return send(socket, { type: 'error', message: 'Invalid message' }) }
  if (!message || typeof message.type !== 'string') return

  if (message.type === 'create-room') {
    if (socket.room) removeMember(socket)
    const id = roomId(); const coachToken = token(24); const joinToken = token(24)
    const room = { id, coachToken, joinToken, createdAt: Date.now(), lastActiveAt: Date.now(), state: null, liveState: null, focus: [null, null], members: [] }
    const member = { socket, id: memberId(), role: 'coach' }
    room.members.push(member); socket.room = room; socket.member = member; rooms.set(id, room)
    send(socket, { type: 'room-created', roomId: id, role: 'coach', memberId: member.id, joinToken, hostToken: coachToken, focus: focusState(room) })
    return
  }

  if (message.type === 'join-room') {
    if (socket.room) return send(socket, { type: 'error', code: 'already-in-room', message: 'すでにルームへ接続しています' })
    const id = typeof message.roomId === 'string' ? message.roomId : ''; const joinToken = typeof message.joinToken === 'string' ? message.joinToken : ''; const hostToken = typeof message.hostToken === 'string' ? message.hostToken : ''
    const room = rooms.get(id)
    if (!room || Date.now() - room.lastActiveAt > ROOM_TTL_MS) { if (room) rooms.delete(id); return send(socket, { type: 'error', code: 'room-not-found', message: 'ルームが見つかりません' }) }
    let role = null
    if (hostToken && hostToken === room.coachToken && !room.members.some(member => member.role === 'coach')) role = 'coach'
    else if (joinToken && joinToken === room.joinToken) { const studentCount = room.members.filter(member => member.role === 'student').length; if (studentCount >= MAX_STUDENTS) return send(socket, { type: 'error', code: 'room-full', message: 'ルームが満員です' }); role = 'student' }
    if (!role) return send(socket, { type: 'error', code: 'invalid-token', message: '招待リンクが無効です' })
    const member = { socket, id: memberId(), role }; room.members.push(member); room.lastActiveAt = Date.now(); socket.room = room; socket.member = member
    send(socket, { type: 'room-joined', roomId: room.id, role, memberId: member.id, studentCount: room.members.filter(item => item.role === 'student').length, state: role === 'student' ? room.state : null, liveState: role === 'student' ? room.liveState : null, focus: focusState(room) })
    broadcast(room, { type: 'presence', studentCount: room.members.filter(member => member.role === 'student').length }, socket); broadcastFocusState(room); return
  }

  const room = socket.room; const member = socket.member; if (!room || !member) return; room.lastActiveAt = Date.now()

  if (message.type === 'request-focus') {
    const playerIndex = Number(message.playerIndex); if (!validPlayerIndex(playerIndex)) return send(socket, { type: 'focus-denied', playerIndex: null, reason: 'invalid-player' })
    const owner = room.focus[playerIndex]
    if (owner && owner !== member.id) return send(socket, { type: 'focus-denied', playerIndex, reason: 'occupied', ownerRole: room.members.find(item => item.id === owner)?.role || null })
    for (let index = 0; index < room.focus.length; index += 1) if (index !== playerIndex && room.focus[index] === member.id) room.focus[index] = null
    room.focus[playerIndex] = member.id; send(socket, { type: 'focus-granted', playerIndex, focus: focusState(room) }); broadcastFocusState(room); return
  }

  if (message.type === 'release-focus') { const playerIndex = Number(message.playerIndex); if (validPlayerIndex(playerIndex) && room.focus[playerIndex] === member.id) { room.focus[playerIndex] = null; broadcastFocusState(room) }; return }

  if (message.type === 'state') {
    if (member.role !== 'coach') return send(socket, { type: 'error', code: 'coach-only', message: '共有Stateを変更できるのはコーチだけです' })
    const state = sanitizeState(message.state); if (!state) return
    room.state = state; broadcast(room, { type: 'state', state }, socket); return
  }

  if (message.type === 'reset-state') {
    if (member.role !== 'coach') return send(socket, { type: 'error', code: 'coach-only-reset', message: 'リセットはコーチだけが実行できます' })
    const state = sanitizeState(message.state); if (!state) return
    room.state = state; room.liveState = null; broadcast(room, { type: 'reset-state', state }, socket); return
  }

  if (message.type === 'student-action') return send(socket, { type: 'error', code: 'action-deprecated', message: '操作命令のRoom中継は無効です' })

  if (message.type === 'time-state') {
    const incoming = message.state
    if (!validTimeState(incoming)) return
    const playerIndex = Number(incoming.playerIndex)
    const hasFocus = room.focus[playerIndex] === member.id
    if (member.role !== 'coach' && !hasFocus) return send(socket, { type: 'error', code: 'focus-not-owned', message: 'このPlayerの操作権を持っていません' })
    const state = mergePlayer(room, incoming, member, hasFocus)
    broadcast(room, { type: 'time-state', state }, socket)
    return
  }

  if (message.type === 'player-state') {
    const incoming = message.state
    if (!incoming || typeof incoming !== 'object' || !validPlayerIndex(incoming.playerIndex) || !incoming.player || typeof incoming.player !== 'object') return
    const playerIndex = Number(incoming.playerIndex)
    if (room.focus[playerIndex] !== member.id) return send(socket, { type: 'error', code: 'focus-not-owned', message: 'このPlayerの操作権を持っていません' })
    const state = mergePlayer(room, incoming, member, true)
    broadcast(room, { type: 'player-state', state }, socket)
    return
  }

  if (message.type === 'live-state') {
    if (member.role !== 'coach') return send(socket, { type: 'error', code: 'coach-only-live', message: 'Timeline同期はコーチだけが実行できます' })
    const state = sanitizeState(message.state); if (!state) return
    room.liveState = state; broadcast(room, { type: 'live-state', state }, socket); return
  }

  if (message.type === 'request-state') { send(socket, { type: 'state', state: room.state }); return }
}

const server = createServer((request, response) => {
  if (request.url === '/health') { response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify({ ok: true, rooms: rooms.size })); return }
  if (!existsSync(DIST)) { response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); response.end('Run `pnpm build` first.'); return }
  const pathname = decodeURIComponent((request.url || '/').split('?')[0]); const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''); const candidate = normalize(join(DIST, relative)); if (!candidate.startsWith(DIST + sep) && candidate !== DIST) { response.writeHead(403); response.end(); return }
  let file = candidate; if (!existsSync(file) || !statSync(file).isFile()) file = join(DIST, 'index.html')
  try { const content = readFileSync(file); const ext = extname(file); const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon' }; response.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream' }); response.end(content) } catch { response.writeHead(500); response.end() }
})
const wss = new WebSocketServer({ server })
wss.on('connection', socket => { socket.on('message', raw => handleMessage(socket, raw)); socket.on('close', () => removeMember(socket)); socket.on('error', () => removeMember(socket)) })
setInterval(() => { const cutoff = Date.now() - ROOM_TTL_MS; for (const [id, room] of rooms) if (room.members.length === 0 || room.lastActiveAt < cutoff) rooms.delete(id) }, 10 * 60 * 1000).unref()
server.listen(PORT, () => console.log(`Puyo Trainer room server listening on http://localhost:${PORT}`))
