import type { GameState, PlayerState, TurnHistoryEntry, TurnState } from './types'
import type { ReplayState } from './replay'

export type RoomRole = 'coach' | 'student'
export type RoomFocusState = [string | null, string | null]
export type RoomAction = 'global-pause'
export interface SharedRoomState { game: GameState; replay: ReplayState; elapsedMs: number }
export interface SharedRoomLiveState { elapsedMs: number; cursorElapsedMs: number; playing: boolean; speed: number }
export type RoomPlayerState = Omit<TurnState, 'puyoSequence'>
export interface RoomPlayerStateSync { playerIndex: 0 | 1; player: RoomPlayerState; tick: number; activePlayer: 0 | 1; running: boolean; elapsedMs: number }
export interface RoomPlayerHistoryStateSync {
  playerIndex: 0 | 1
  player: PlayerState
  tick: number
  activePlayer: 0 | 1
  running: boolean
  elapsedMs: number
}
export interface RoomTimeStateSync {
  playerIndex: 0 | 1
  tick: number
  activePlayer: 0 | 1
  running: boolean
  elapsedMs: number
  player: Pick<TurnState, 'current' | 'next' | 'paused' | 'alive' | 'resolution' | 'fallElapsedMs' | 'lockElapsedMs' | 'quickTurnArmed' | 'score' | 'chain' | 'incomingGarbage' | 'garbage' | 'puyoSequenceIndex' | 'puyoSequenceSeed'>
}
type Listener = (message: RoomMessage) => void
type RoomMessage =
  | { type: 'room-created'; roomId: string; role: RoomRole; memberId: string; joinToken: string; hostToken?: string; focus: RoomFocusState }
  | { type: 'room-joined'; roomId: string; role: RoomRole; memberId: string; studentCount: number; state: SharedRoomState | null; liveState: SharedRoomLiveState | null; focus: RoomFocusState }
  | { type: 'state'; state: SharedRoomState | null }
  | { type: 'live-state'; state: SharedRoomLiveState }
  | { type: 'player-state'; state: RoomPlayerStateSync }
  | { type: 'player-history-state'; state: RoomPlayerHistoryStateSync }
  | { type: 'time-state'; state: RoomTimeStateSync }
  | { type: 'reset-state'; state: SharedRoomState }
  | { type: 'presence'; studentCount: number }
  | { type: 'focus-state'; focus: RoomFocusState }
  | { type: 'focus-granted'; playerIndex: 0 | 1; focus: RoomFocusState }
  | { type: 'focus-denied'; playerIndex: 0 | 1 | null; reason: string; ownerRole?: RoomRole | null }
  | { type: 'disconnected' }
  | { type: 'error'; code?: string; message: string }
const HOST_TOKEN_PREFIX = 'puyo-trainer-room-host:'
const ROOM_SESSION_KEY = 'puyo-trainer-room-session'
function wsUrl(): string { const configured = import.meta.env.VITE_ROOM_WS_URL; if (configured) return configured; const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'; const port = import.meta.env.DEV ? ':8787' : (window.location.port ? `:${window.location.port}` : ''); return `${protocol}//${window.location.hostname}${port}` }
function parseInvite(): { roomId: string; joinToken: string } | null { const hash = window.location.hash.replace(/^#/, ''); if (!hash) return null; const params = new URLSearchParams(hash); const roomId = params.get('room') || ''; const joinToken = params.get('token') || ''; return roomId && joinToken ? { roomId, joinToken } : null }
function storeHostToken(roomId: string, hostToken: string): void { try { localStorage.setItem(`${HOST_TOKEN_PREFIX}${roomId}`, hostToken) } catch {} }
function loadHostToken(roomId: string): string { try { return localStorage.getItem(`${HOST_TOKEN_PREFIX}${roomId}`) || '' } catch { return '' } }
function storeRoomSession(roomId: string, joinToken: string): void { if (!roomId || !joinToken) return; try { localStorage.setItem(ROOM_SESSION_KEY, JSON.stringify({ roomId, joinToken })) } catch {} }
function loadRoomSession(): { roomId: string; joinToken: string } | null { try { const raw = localStorage.getItem(ROOM_SESSION_KEY); if (!raw) return null; const parsed = JSON.parse(raw) as Partial<{ roomId: string; joinToken: string }>; return typeof parsed.roomId === 'string' && typeof parsed.joinToken === 'string' && parsed.roomId && parsed.joinToken ? { roomId: parsed.roomId, joinToken: parsed.joinToken } : null } catch { return null } }
function clearRoomSession(): void { try { localStorage.removeItem(ROOM_SESSION_KEY) } catch {} }
export function getRoomInviteFromUrl(): { roomId: string; joinToken: string } | null { return parseInvite() }
export function getStoredRoomSession(): { roomId: string; joinToken: string } | null { return loadRoomSession() }

export class RoomClient {
  private socket: WebSocket | null = null
  private listeners = new Set<Listener>()
  private _role: RoomRole | null = null
  private _roomId = ''
  private _memberId = ''
  private _studentCount = 0
  private _focus: RoomFocusState = [null, null]
  private pendingJoin: { roomId: string; joinToken: string } | null = null
  get role(): RoomRole | null { return this._role }
  get roomId(): string { return this._roomId }
  get memberId(): string { return this._memberId }
  get studentCount(): number { return this._studentCount }
  get focus(): RoomFocusState { return [...this._focus] as RoomFocusState }
  hasFocus(playerIndex: 0 | 1): boolean { return this._role !== null && this._focus[playerIndex] === this._memberId }
  subscribe(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  private emit(message: RoomMessage): void { for (const listener of this.listeners) listener(message) }
  private connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve()
    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) return new Promise((resolve, reject) => { const socket = this.socket; if (!socket) return reject(new Error('ルームサーバーへ接続できません')); let settled = false; const cleanup = () => { if (settled) return; settled = true; socket.removeEventListener('open', waitForOpen); socket.removeEventListener('close', waitForClose); socket.removeEventListener('error', waitForClose) }; const waitForOpen = () => { if (socket.readyState === WebSocket.OPEN) { cleanup(); resolve() } }; const waitForClose = () => { cleanup(); reject(new Error('ルームサーバーへ接続できません')) }; socket.addEventListener('open', waitForOpen); socket.addEventListener('close', waitForClose); socket.addEventListener('error', waitForClose) })
    return new Promise((resolve, reject) => { const socket = new WebSocket(wsUrl()); this.socket = socket; let settled = false; const settleReject = () => { if (!settled) { settled = true; reject(new Error('ルームサーバーへ接続できません')) } }; socket.onopen = () => { if (!settled) { settled = true; resolve() } }; socket.onerror = settleReject; socket.onmessage = event => { let message: RoomMessage; try { message = JSON.parse(String(event.data)) as RoomMessage } catch { return }; if (message.type === 'room-created') { this._role = message.role; this._roomId = message.roomId; this._memberId = message.memberId; this._focus = [...message.focus] as RoomFocusState; if (message.hostToken) storeHostToken(message.roomId, message.hostToken); storeRoomSession(message.roomId, message.joinToken); this.pendingJoin = null } else if (message.type === 'room-joined') { this._role = message.role; this._roomId = message.roomId; this._memberId = message.memberId; this._studentCount = message.studentCount; this._focus = [...message.focus] as RoomFocusState; if (this.pendingJoin?.roomId === message.roomId) storeRoomSession(message.roomId, this.pendingJoin.joinToken); this.pendingJoin = null }; if (message.type === 'presence') this._studentCount = message.studentCount; if (message.type === 'focus-state') this._focus = [...message.focus] as RoomFocusState; if (message.type === 'focus-granted') this._focus = [...message.focus] as RoomFocusState; if (message.type === 'error') { const stored = loadRoomSession(); if ((message.code === 'room-not-found' || message.code === 'invalid-token') && this.pendingJoin && stored?.roomId === this.pendingJoin.roomId && stored.joinToken === this.pendingJoin.joinToken) clearRoomSession(); this.pendingJoin = null }; this.emit(message) }; socket.onclose = () => { if (!settled) settleReject(); if (this.socket === socket) { this.socket = null; this._role = null; this._memberId = ''; this._focus = [null, null] }; this.emit({ type: 'disconnected' }) } })
  }
  private send(payload: object): void { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload)) }
  async createRoom(): Promise<void> { clearRoomSession(); this.pendingJoin = null; await this.connect(); this.send({ type: 'create-room' }) }
  async join(roomId: string, joinToken: string): Promise<void> { this.pendingJoin = { roomId, joinToken }; await this.connect(); this.send({ type: 'join-room', roomId, joinToken, hostToken: loadHostToken(roomId) }) }
  async rejoinStoredRoom(): Promise<boolean> { const session = loadRoomSession(); if (!session) return false; this.pendingJoin = session; await this.connect(); this.send({ type: 'join-room', roomId: session.roomId, joinToken: session.joinToken, hostToken: loadHostToken(session.roomId) }); return true }
  async requestFocus(playerIndex: 0 | 1): Promise<void> { if (!this._role || this._focus[playerIndex] === this._memberId) return; await this.connect(); this.send({ type: 'request-focus', playerIndex }) }
  releaseFocus(playerIndex: 0 | 1): void { if (!this._role || this._focus[playerIndex] !== this._memberId) return; this.send({ type: 'release-focus', playerIndex }) }
  forgetStoredRoom(): void { clearRoomSession(); this.pendingJoin = null }
  sendState(state: SharedRoomState): void { if (this._role !== 'coach') return; this.send({ type: 'state', state }) }
  sendLiveState(state: SharedRoomLiveState): void { if (this._role !== 'coach') return; this.send({ type: 'live-state', state }) }
  sendPlayerState(state: RoomPlayerStateSync): void { if (!this.hasFocus(state.playerIndex)) return; this.send({ type: 'player-state', state }) }
  sendPlayerHistoryState(state: RoomPlayerHistoryStateSync): void { if (!this.hasFocus(state.playerIndex)) return; this.send({ type: 'player-history-state', state }) }
  sendTimeState(state: RoomTimeStateSync): void { if (this._role !== 'coach') return; this.send({ type: 'time-state', state }) }
  sendResetState(state: SharedRoomState): void { if (this._role !== 'coach') return; this.send({ type: 'reset-state', state }) }
  disconnect(): void { this.pendingJoin = null; this.socket?.close(); this.socket = null; this._role = null; this._memberId = ''; this._focus = [null, null] }
  static inviteUrl(roomId: string, joinToken: string): string { const url = new URL(window.location.href); url.search = ''; url.hash = new URLSearchParams({ room: roomId, token: joinToken }).toString(); return url.toString() }
}
