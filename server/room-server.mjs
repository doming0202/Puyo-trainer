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
function validPlayerIndex(value) { const index = Number(value); return Number.isInteger(index) && index >= 0 && index <= 1 }
function allowedRoomAction(action) { return new Set(['left', 'right', 'rotate-left', 'rotate-right', 'soft-drop', 'hard-drop', 'reset-turn', 'undo', 'redo', 'toggle-player-pause']).has(action) }
function validTimeState(state) { if (!state || typeof state !== 'object' || !validPlayerIndex(state.playerIndex)) return false; if (!state.player || typeof state.player !== 'object') return false; return Number.isFinite(state.tick) && Number.isFinite(state.elapsedMs) }
function mergePlayer(room, state) { const playerIndex = Number(state.playerIndex); if (!room.state?.game?.players?.[playerIndex]) return; const players = [...room.state.game.players]; players[playerIndex] = { ...players[playerIndex], ...state.player }; room.state = { ...room.state, game: { ...room.state.game, players, activePlayer: state.activePlayer === 1 ? 1 : 0, running: Boolean(state.running), tick: Number.isFinite(state.tick) ? Math.max(room.state.game.tick, state.tick) : room.state.game.tick }, elapsedMs: Number.isFinite(state.elapsedMs) ? Math.max(0, state.elapsedMs) : room.state.elapsedMs } }
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

  if (message.type === 'state' && member.role === 'coach') { const state = sanitizeState(message.state); if (!state) return; room.state = state; broadcast(room, { type: 'state', state }, socket); return }

  if (message.type === 'reset-state') { const state = sanitizeState(message.state); if (!state) return; room.state = state; room.liveState = null; broadcast(room, { type: 'reset-state', state }, socket); return }

  if (message.type === 'student-action') {
    const playerIndex = Number(message.playerIndex); const action = typeof message.action === 'string' ? message.action : ''
    if (!validPlayerIndex(playerIndex) || (!allowedRoomAction(action) && action !== 'global-pause')) return send(socket, { type: 'error', code: 'invalid-room-action', message: '無効なルーム操作です' })
    if (action !== 'global-pause' && room.focus[playerIndex] !== member.id) return send(socket, { type: 'error', code: 'focus-not-owned', message: 'このPlayerの操作権を持っていません' })
    const elapsedMs = Number.isFinite(message.elapsedMs) ? Math.max(0, Number(message.elapsedMs)) : undefined
    broadcast(room, { type: 'student-action', playerIndex, action, ...(elapsedMs === undefined ? {} : { elapsedMs }) }, socket)
    return
  }

  if (message.type === 'time-state') {
    const state = message.state
    if (!validTimeState(state)) return
    const playerIndex = Number(state.playerIndex)
    if (room.focus[playerIndex] !== member.id) return send(socket, { type: 'error', code: 'focus-not-owned', message: 'このPlayerの操作権を持っていません' })
    mergePlayer(room, state); broadcast(room, { type: 'time-state', state }, socket); return
  }

  if (message.type === 'player-state') {
    const state = message.state
    if (!state || typeof state !== 'object' || !validPlayerIndex(state.playerIndex) || !state.player || typeof state.player !== 'object') return
    const playerIndex = Number(state.playerIndex)
    if (room.focus[playerIndex] !== member.id) return send(socket, { type: 'error', code: 'focus-not-owned', message: 'このPlayerの操作権を持っていません' })
    mergePlayer(room, state); broadcast(room, { type: 'player-state', state }, socket); return
  }

  if (message.type === 'live-state' && member.role === 'coach') { const state = sanitizeState(message.state); if (!state) return; room.liveState = state; broadcast(room, { type: 'live-state', state }, socket); return }
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
