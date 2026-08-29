import { RoomClient } from './game/room-client'

/**
 * Keep the existing RoomPanel UI path, but make the transport suitable for live play.
 * Local gameplay never waits for the network; full snapshots are disabled while running,
 * replay/live timeline packets are ignored during live play, and player snapshots are
 * rate-limited while still being sent immediately after a local action.
 */

type PlayerStateSyncLike = {
  playerIndex: 0 | 1
  player: Record<string, unknown>
  tick: number
  activePlayer: 0 | 1
  running: boolean
  elapsedMs: number
}

type RoomClientTransport = {
  send: (payload: unknown) => void
}

const clientProto = RoomClient.prototype as unknown as {
  sendState: (this: RoomClient, state: { game: { running: boolean }; replay: unknown; elapsedMs: number }) => void
  sendLiveState: (this: RoomClient, state: { playing: boolean; speed: number; elapsedMs: number; cursorElapsedMs: number }) => void
  sendPlayerState: (this: RoomClient, state: PlayerStateSyncLike) => void
  sendAction: (this: RoomClient, playerIndex: 0 | 1, action: string) => void
  send?: RoomClientTransport['send']
}

const originalSendState = clientProto.sendState
const originalSendLiveState = clientProto.sendLiveState
const originalSendPlayerState = clientProto.sendPlayerState
const originalSendAction = clientProto.sendAction

const lastPlayerSendAt: [number, number] = [0, 0]
const localActionAt: [number, number] = [0, 0]
let suppressRemoteActionEcho = false

function markLocalAction(event: Event): void {
  const detail = (event as CustomEvent<{ playerIndex: 0 | 1; action?: string }>).detail
  if (!detail || (detail.playerIndex !== 0 && detail.playerIndex !== 1)) return
  localActionAt[detail.playerIndex] = performance.now()
}

if (typeof window !== 'undefined') {
  window.addEventListener('puyo-room-local-action', markLocalAction)
  window.addEventListener('puyo-room-student-action', () => {
    suppressRemoteActionEcho = true
    queueMicrotask(() => { suppressRemoteActionEcho = false })
  })
}

clientProto.sendState = function (state) {
  // A running game must never be overwritten by a stale full snapshot.
  if (state.game?.running) return
  originalSendState.call(this, state)
}

clientProto.sendLiveState = function (state) {
  // Timeline/replay transport is useful for replay playback, not live battle frames.
  if (!state.playing) return
  originalSendLiveState.call(this, state)
}

clientProto.sendPlayerState = function (state) {
  const index = state.playerIndex
  const now = performance.now()
  const dueToLocalAction = localActionAt[index] > lastPlayerSendAt[index]
  if (!dueToLocalAction && now - lastPlayerSendAt[index] < 1000) return

  const player = { ...state.player }
  delete player.turnStart
  delete player.undoStack
  delete player.redoStack

  lastPlayerSendAt[index] = now
  originalSendPlayerState.call(this, {
    ...state,
    player,
  })
}

clientProto.sendAction = function (playerIndex, action) {
  if (suppressRemoteActionEcho) return
  originalSendAction.call(this, playerIndex, action)
}
