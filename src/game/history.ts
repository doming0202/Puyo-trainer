import type { PlayerState } from './types'

type PlayerHistory = {
  initial: PlayerState
  undoStack: PlayerState[]
}

const histories = new WeakMap<object, PlayerHistory>()

function cloneState(player: PlayerState): PlayerState {
  return structuredClone(player)
}

function getOrCreateHistory(player: PlayerState): PlayerHistory {
  const existing = histories.get(player)
  if (existing) return existing

  const history: PlayerHistory = {
    initial: cloneState(player),
    undoStack: [],
  }
  histories.set(player, history)
  return history
}

function areEqual(a: PlayerState, b: PlayerState): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Record one human operation as an undo point and carry the same history
 * object onto the resulting immutable PlayerState.
 */
export function trackTransition(before: PlayerState, after: PlayerState): PlayerState {
  const history = getOrCreateHistory(before)

  if (after === before || areEqual(before, after)) return before

  history.undoStack.push(cloneState(before))
  histories.set(after, history)
  return after
}

/** Undo the most recent recorded gameplay operation. */
export function undoPlayer(player: PlayerState): PlayerState {
  const history = getOrCreateHistory(player)
  const previous = history.undoStack.pop()
  if (!previous) return player

  histories.set(previous, history)
  return previous
}

/** Return to the first state of the current player-history session. */
export function resetPlayerToInitial(player: PlayerState): PlayerState {
  const history = getOrCreateHistory(player)
  const initial = cloneState(history.initial)
  history.undoStack.length = 0
  histories.set(initial, history)
  return initial
}
