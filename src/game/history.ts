import type { PlayerState, TurnHistoryEntry, TurnState } from './types'

export function snapshotTurnState(player: PlayerState): TurnState {
  return {
    board: player.board.map((row) => [...row]),
    current: { ...player.current, pair: { ...player.current.pair } },
    next: player.next.map((pair) => ({ ...pair })),
    garbage: player.garbage,
    score: player.score,
    chain: player.chain,
    controlMode: player.controlMode,
    alive: player.alive,
    resolution: player.resolution ? structuredClone(player.resolution) : undefined,
    fallElapsedMs: player.fallElapsedMs,
    lockElapsedMs: player.lockElapsedMs,
    quickTurnArmed: player.quickTurnArmed,
  }
}

function cloneHistoryEntry(entry: TurnHistoryEntry): TurnHistoryEntry {
  return {
    state: structuredClone(entry.state),
    turnStart: structuredClone(entry.turnStart),
    undoStack: entry.undoStack.map((state) => structuredClone(state)),
  }
}

/**
 * A new falling puyo starts a new logical turn. The previous turn's
 * starting state becomes the next Undo checkpoint.
 */
export function startNewTurn(player: PlayerState): PlayerState {
  // `player.turnStart` is the state from which the just-finished puyo began.
  // Keep that as the checkpoint for stepping one turn backward.
  const previousTurnStart = structuredClone(player.turnStart)
  const nextTurnStart = snapshotTurnState(player)

  return {
    ...player,
    turnStart: nextTurnStart,
    undoStack: [...player.undoStack, previousTurnStart],
    redoStack: [],
  }
}

/**
 * Manual movement within the current falling-puyo turn does not create an
 * Undo checkpoint. It only invalidates Redo after a new branch is taken.
 */
export function recordTurnAction(before: PlayerState, after: PlayerState): PlayerState {
  if (before === after) return before
  return {
    ...after,
    turnStart: before.turnStart,
    undoStack: before.undoStack,
    redoStack: [],
  }
}

/**
 * Undo means one falling-puyo turn backward, not one key press backward.
 */
export function undoTurnAction(player: PlayerState): PlayerState {
  if (player.undoStack.length === 0) return player

  const previousTurnStart = player.undoStack[player.undoStack.length - 1]
  const redoEntry: TurnHistoryEntry = {
    state: snapshotTurnState(player),
    turnStart: player.turnStart,
    undoStack: player.undoStack.slice(),
  }

  return {
    ...previousTurnStart,
    controlMode: player.controlMode,
    turnStart: previousTurnStart,
    undoStack: player.undoStack.slice(0, -1),
    redoStack: [...player.redoStack, redoEntry],
  }
}

/**
 * Redo restores the exact state that was visible before the corresponding
 * Undo, then makes the undone turn available to Undo again.
 */
export function redoTurnAction(player: PlayerState): PlayerState {
  if (player.redoStack.length === 0) return player

  const entry = player.redoStack[player.redoStack.length - 1]
  return {
    ...entry.state,
    controlMode: player.controlMode,
    turnStart: entry.turnStart,
    undoStack: entry.undoStack,
    redoStack: player.redoStack.slice(0, -1).map(cloneHistoryEntry),
  }
}

/**
 * R resets only the current falling puyo to the moment it appeared.
 * It does not erase the history of older turns.
 */
export function resetToTurnStart(player: PlayerState): PlayerState {
  return {
    ...player.turnStart,
    controlMode: player.controlMode,
    turnStart: player.turnStart,
    undoStack: player.undoStack,
    redoStack: [],
  }
}
