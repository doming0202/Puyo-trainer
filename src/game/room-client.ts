import type { GameState } from './types'
import type { ReplayState } from './replay'

export type RoomRole = 'coach' | 'student'

export interface SharedRoomState {
  game: GameState
  replay: ReplayState
  elapsedMs: number
}

type Listener = (message: RoomMessage) => void

type RoomMessage =
  | { type: 'room-created'; roomId: string; role: RoomRole; joinToken: string; hostToken?: string }
  | { type: 'room-joined'; roomId: string; role: RoomRole; studentCount: number; state: SharedRoomState | null }
  | { type: 'state'; state: SharedRoomState | null }
  | { type: 'presence'; studentCount: number }
  | { type: 'coach-command'; command: { kind: string; value?: number } }
  | { type: 'error'; code?: string; message: string }

const HOST_TOKEN_PREFIX = 'puyo-trainer-room-host:'

function wsUrl(): string {
  const configured = import.meta.env.VITE_ROOM_WS_URL
  if (configured) return configured
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const port = import.meta.env.DEV ? ':8787' : (window.location.port ? `:${window.location.port}` : '')
  return `${protocol}//${window.location.hostname}${port}`
}

function parseInvite(): { roomId: string; joinToken: string } | null {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return null
  const params = new URLSearchParams(hash)
  const roomId = params.get('room') || ''
  const joinToken = params.get('token') || ''
  return roomId && joinToken ? { roomId, joinToken } : null
}

function storeHostToken(roomId: string, hostToken: string): void {
  try { localStorage.setItem(`${HOST_TOKEN_PREFIX}${roomId}`, hostToken) } catch { /* session still works */ }
}

function loadHostToken(roomId: string): string {
  try { return localStorage.getItem(`${HOST_TOKEN_PREFIX}${roomId}`) || '' } catch { return '' }
}

export function getRoomInviteFromUrl(): { roomId: string; joinToken: string } | null {
  return parseInvite()
}

export class RoomClient {
  private socket: WebSocket | null = null
  private listeners = new Set<Listener>()
  private _role: RoomRole | null = null
  private _roomId = ''
  private _studentCount = 0

  get role(): RoomRole | null { return this._role }
  get roomId(): string { return this._roomId }
  get studentCount(): number { return this._studentCount }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(message: RoomMessage): void {
    for (const listener of this.listeners) listener(message)
  }

  private connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl())
      this.socket = socket
      let settled = false
      socket.onopen = () => { if (!settled) { settled = true; resolve() } }
      socket.onerror = () => { if (!settled) { settled = true; reject(new Error('ルームサーバーへ接続できません')) } }
      socket.onmessage = event => {
        let message: RoomMessage
        try { message = JSON.parse(String(event.data)) as RoomMessage } catch { return }
        if (message.type === 'room-created' || message.type === 'room-joined') {
          this._role = message.role
          this._roomId = message.roomId
          if (message.type === 'room-created' && message.hostToken) storeHostToken(message.roomId, message.hostToken)
          if (message.type === 'room-joined') {
            this._studentCount = message.studentCount
          }
        }
        if (message.type === 'presence') this._studentCount = message.studentCount
        this.emit(message)
      }
      socket.onclose = () => {
        this.socket = null
        this._role = null
      }
    })
  }

  private send(payload: object): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    this.socket.send(JSON.stringify(payload))
  }

  async createRoom(): Promise<void> {
    await this.connect()
    this.send({ type: 'create-room' })
  }

  async join(roomId: string, joinToken: string): Promise<void> {
    await this.connect()
    const hostToken = loadHostToken(roomId)
    this.send({ type: 'join-room', roomId, joinToken, hostToken })
  }

  sendState(state: SharedRoomState): void {
    if (this._role !== 'coach') return
    this.send({ type: 'state', state })
  }

  requestState(): void {
    if (this._role !== 'student') return
    this.send({ type: 'request-state' })
  }

  sendCoachCommand(command: { kind: string; value?: number }): void {
    if (this._role !== 'coach') return
    this.send({ type: 'coach-command', command })
  }

  disconnect(): void {
    this.socket?.close()
    this.socket = null
    this._role = null
  }

  static inviteUrl(roomId: string, joinToken: string): string {
    const url = new URL(window.location.href)
    url.search = ''
    url.hash = new URLSearchParams({ room: roomId, token: joinToken }).toString()
    return url.toString()
  }
}
