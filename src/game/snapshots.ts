import { snapshotTurnState } from './history'
import { emptyHiddenBoard } from './engine'
import type { GameState, PlayerState, TurnState } from './types'

export interface Snapshot {
  id: string
  title: string
  tags: string[]
  createdAt: number
  sourceTick: number
  state: GameState
}

const DB_NAME = 'puyo-trainer'
const STORE_NAME = 'snapshots'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
  })
}

export async function listSnapshots(): Promise<Snapshot[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).index('createdAt').getAll()
    request.onsuccess = () => resolve((request.result as Snapshot[]).sort((a, b) => b.createdAt - a.createdAt))
    request.onerror = () => reject(request.error ?? new Error('Snapshot list failed'))
  })
}

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(snapshot)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Snapshot save failed'))
  })
}

export async function deleteSnapshot(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Snapshot delete failed'))
  })
}

function normalizeHidden(hidden: PlayerState['hidden'] | undefined): PlayerState['hidden'] {
  if (Array.isArray(hidden) && hidden.length === 2) return hidden.map((row) => [...row])
  return emptyHiddenBoard()
}

function normalizeTurnState(state: TurnState, fallback: PlayerState): TurnState {
  const incomingGarbage = state.incomingGarbage ?? state.garbage ?? fallback.incomingGarbage ?? fallback.garbage ?? 0
  return {
    ...state,
    board: state.board?.map((row) => [...row]) ?? fallback.board.map((row) => [...row]),
    hidden: normalizeHidden(state.hidden),
    current: state.current ? { ...state.current, pair: { ...state.current.pair } } : { ...fallback.current, pair: { ...fallback.current.pair } },
    next: state.next?.map((pair) => ({ ...pair })) ?? fallback.next.map((pair) => ({ ...pair })),
    incomingGarbage,
    garbage: state.garbage ?? incomingGarbage,
    score: state.score ?? fallback.score,
    chain: state.chain ?? fallback.chain,
    controlMode: state.controlMode ?? fallback.controlMode,
    alive: state.alive ?? fallback.alive,
    resolution: state.resolution ? structuredClone(state.resolution) : undefined,
    fallElapsedMs: state.fallElapsedMs ?? 0,
    lockElapsedMs: state.lockElapsedMs ?? 0,
    quickTurnArmed: state.quickTurnArmed ?? false,
  }
}

function normalizePlayer(player: PlayerState): PlayerState {
  const incomingGarbage = player.incomingGarbage ?? player.garbage ?? 0
  const base = {
    ...player,
    incomingGarbage,
    garbage: player.garbage ?? incomingGarbage,
    board: player.board.map((row) => [...row]),
    hidden: normalizeHidden(player.hidden),
    fallElapsedMs: player.fallElapsedMs ?? 0,
    lockElapsedMs: player.lockElapsedMs ?? 0,
    quickTurnArmed: player.quickTurnArmed ?? false,
  }

  const turnStart = player.turnStart
    ? normalizeTurnState(player.turnStart, base)
    : snapshotTurnState(base)

  const undoStack = (player.undoStack ?? []).map((state) => normalizeTurnState(state, base))
  const redoStack = (player.redoStack ?? []).map((entry) => ({
    ...entry,
    state: normalizeTurnState(entry.state, base),
    turnStart: normalizeTurnState(entry.turnStart, base),
    undoStack: (entry.undoStack ?? []).map((state) => normalizeTurnState(state, base)),
  }))

  return {
    ...base,
    turnStart,
    undoStack,
    redoStack,
  }
}

export function cloneGameState(game: GameState): GameState {
  const cloned = structuredClone(game)
  return {
    ...cloned,
    players: [normalizePlayer(cloned.players[0]), normalizePlayer(cloned.players[1])],
  }
}

export function makeSnapshot(game: GameState, title: string, tags: string[] = []): Snapshot {
  return {
    id: crypto.randomUUID(),
    title: title.trim() || `局面 ${new Date().toLocaleString('ja-JP')}`,
    tags: tags.filter(Boolean),
    createdAt: Date.now(),
    sourceTick: game.tick,
    state: cloneGameState(game),
  }
}
