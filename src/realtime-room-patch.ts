import { RoomClient } from './game/room-client'

/**
 * Transport policy for live coaching rooms.
 *
 * Gameplay itself stays local and never waits for the network. Room traffic is
 * split into:
 *   - full state: only the initial snapshot and stopped/replay states
 *   - player state: immediate on a local action / running-state change, plus
 *     at most once per second when the controlled player's tick changed
 *   - replay timeline: only while replay playback is active
 *
 * This file is intentionally a small transport layer so the gameplay engine
 * does not need to know anything about WebSocket timing.
 */

type PlayerStateSyncLike = {
  playerIndex: 0 | 1
  player: Record<string, unknown>
  tick: number
  activePlayer: 0 | 1
  running: boolean
  elapsedMs: number
}

type RoomClientPrototype = {
  sendState: (this: RoomClient, state: { game: { running: boolean }; replay: unknown; elapsedMs: number }) => void
  sendLiveState: (this: RoomClient, state: { playing: boolean; speed: number; elapsedMs: number; cursorElapsedMs: number }) => void
  sendPlayerState: (this: RoomClient, state: PlayerStateSyncLike) => void
}

const clientProto = RoomClient.prototype as unknown as RoomClientPrototype & {
  send: (this: RoomClient, payload: unknown) => void
}

const originalSendState = clientProto.sendState
const originalSendLiveState = clientProto.sendLiveState
const originalSendPlayerState = clientProto.sendPlayerState

const initialStateSent = new WeakSet<RoomClient>()
const lastPlayerSendAt = new WeakMap<RoomClient, [number, number]>()
const lastPlayerTick = new WeakMap<RoomClient, [number, number]>()
const lastPlayerRunning = new WeakMap<RoomClient, [boolean | null, boolean | null]>()
const localActionAt: [number, number] = [0, 0]

const PLAYER_SYNC_INTERVAL_MS = 1000
const LOCAL_ACTION_PRIORITY_MS = 150

function recentLocalAction(index: 0 | 1, now: number): boolean {
  return now - localActionAt[index] <= LOCAL_ACTION_PRIORITY_MS
}

function markLocalAction(event: Event): void {
  const detail = (event as CustomEvent<{ playerIndex: 0 | 1 }>).detail
  if (!detail || (detail.playerIndex !== 0 && detail.playerIndex !== 1)) return
  localActionAt[detail.playerIndex] = performance.now()
}

if (typeof window !== 'undefined') {
  window.addEventListener('puyo-room-local-action', markLocalAction)
}

clientProto.sendState = function (state) {
  // The first full snapshot is required so a newly joined student gets the
  // exact current board/sequence. After that, live play uses lightweight
  // player-state messages instead of repeatedly shipping the replay buffer.
  if (!initialStateSent.has(this) || !state.game?.running) {
    initialStateSent.add(this)
    originalSendState.call(this, state)
  }
}

clientProto.sendLiveState = function (state) {
  // Timeline/replay traffic has no role in live battle synchronization.
  if (!state.playing) return
  originalSendLiveState.call(this, state)
}

clientProto.sendPlayerState = function (state) {
  const index = state.playerIndex
  const now = performance.now()
  const sentAt = lastPlayerSendAt.get(this) ?? [0, 0]
  const sentTick = lastPlayerTick.get(this) ?? [-1, -1]
  const sentRunning = lastPlayerRunning.get(this) ?? [null, null]
  const actionPriority = recentLocalAction(index, now)
  const runningChanged = sentRunning[index] !== null && sentRunning[index] !== state.running
  const tickChanged = sentTick[index] !== state.tick
  const intervalElapsed = now - sentAt[index] >= PLAYER_SYNC_INTERVAL_MS

  // A coach must not keep sending stale corrections for a Player currently
  // controlled by a student. Local actions still get their immediate packet.
  const ownsFocus = this.focus[index] === this.memberId
  if (!ownsFocus && !actionPriority && !runningChanged) return
  if (!actionPriority && !runningChanged && !(intervalElapsed && tickChanged)) return

  const player = { ...state.player }
  delete player.turnStart
  delete player.undoStack
  delete player.redoStack
  delete player.puyoSequence

  sentAt[index] = now
  sentTick[index] = state.tick
  sentRunning[index] = state.running
  lastPlayerSendAt.set(this, sentAt)
  lastPlayerTick.set(this, sentTick)
  lastPlayerRunning.set(this, sentRunning)

  originalSendPlayerState.call(this, {
    ...state,
    player,
  })
}
