import type { PlayerState, TurnState } from './types'

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

export function startNewTurn(player: PlayerState): PlayerState {
  const start = snapshotTurnState(player)
  return {
    ...player,
    turnStart: start,
    undoStack: [],
    redoStack: [],
  }
}

export function recordTurnAction(before: PlayerState, after: PlayerState): PlayerState {
  if (before === after) return before
  return {
    ...after,
    turnStart: structuredClone(before.turnStart),
    undoStack: [...before.undoStack.map((entry) => structuredClone(entry)), snapshotTurnState(before)],
    redoStack: [],
  }
}

export function undoTurnAction(player: PlayerState): PlayerState {
  if (player.undoStack.length === 0) return player
  const previous = structuredClone(player.undoStack[player.undoStack.length - 1])
  return {
    ...previous,
    controlMode: player.controlMode,
    turnStart: structuredClone(player.turnStart),
    undoStack: player.undoStack.slice(0, -1).map((entry) => structuredClone(entry)),
    redoStack: [...player.redoStack.map((entry) => structuredClone(entry)), snapshotTurnState(player)],
  }
}

export function redoTurnAction(player: PlayerState): PlayerState {
  if (player.redoStack.length === 0) return player
  const next = structuredClone(player.redoStack[player.redoStack.length - 1])
  return {
    ...next,
    controlMode: player.controlMode,
    turnStart: structuredClone(player.turnStart),
    undoStack: [...player.undoStack.map((entry) => structuredClone(entry)), snapshotTurnState(player)],
    redoStack: player.redoStack.slice(0, -1).map((entry) => structuredClone(entry)),
  }
}

export function resetToTurnStart(player: PlayerState): PlayerState {
  return {
    ...structuredClone(player.turnStart),
    controlMode: player.controlMode,
    turnStart: structuredClone(player.turnStart),
    undoStack: [],
    redoStack: [],
  }
}
