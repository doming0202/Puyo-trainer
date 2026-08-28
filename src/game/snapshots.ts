import { snapshotTurnState } from './history'
import type { GameState, PlayerState } from './types'

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

function normalizePlayer(player: PlayerState): PlayerState {
  const normalized = {
    ...player,
    fallElapsedMs: player.fallElapsedMs ?? 0,
    lockElapsedMs: player.lockElapsedMs ?? 0,
    quickTurnArmed: player.quickTurnArmed ?? false,
  }
  if (!normalized.turnStart) normalized.turnStart = snapshotTurnState(normalized)
  if (!normalized.undoStack) normalized.undoStack = []
  if (!normalized.redoStack) normalized.redoStack = []
  return normalized
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
