import type { GameState, PlayerState, TurnState } from './types'
import type { ReplayFrame, ReplayState } from './replay'

/**
 * X-pause is a local/session control state. It must never become part of a
 * replay timeline, persisted snapshot, or shared room state.
 *
 * The field remains on the runtime types for backwards compatibility with
 * existing engine code and older serialized data. These helpers are the
 * single boundary for data that leaves the live game session.
 */
function stripTurnState(state: TurnState): TurnState {
  return {
    ...structuredClone(state),
    paused: false,
  }
}

export function stripTransientPlayerState(player: PlayerState): PlayerState {
  const cloned = structuredClone(player)
  return {
    ...cloned,
    paused: false,
    turnStart: stripTurnState(cloned.turnStart),
    undoStack: cloned.undoStack.map(stripTurnState),
    redoStack: cloned.redoStack.map((entry) => ({
      ...entry,
      state: stripTurnState(entry.state),
      turnStart: stripTurnState(entry.turnStart),
      undoStack: entry.undoStack.map(stripTurnState),
    })),
  }
}

export function gameForPersistence(game: GameState): GameState {
  const cloned = structuredClone(game)
  return {
    ...cloned,
    players: [stripTransientPlayerState(cloned.players[0]), stripTransientPlayerState(cloned.players[1])],
  }
}

export function frameForReplay(game: GameState, elapsedMs: number, tick = game.tick): ReplayFrame {
  const persistent = gameForPersistence(game)
  return {
    tick,
    elapsedMs: Math.max(0, elapsedMs),
    players: [persistent.players[0], persistent.players[1]],
    activePlayer: persistent.activePlayer,
  }
}

export function replayForSharing(replay: ReplayState): ReplayState {
  const cloned = structuredClone(replay)
  const normalizedFrames = cloned.frames.map((frame) => ({
    ...frame,
    players: [
      stripTransientPlayerState(frame.players[0]),
      stripTransientPlayerState(frame.players[1]),
    ],
  } as ReplayFrame))

  const normalizedOriginalFrames = cloned.originalFrames?.map((frame) => ({
    ...frame,
    players: [
      stripTransientPlayerState(frame.players[0]),
      stripTransientPlayerState(frame.players[1]),
    ],
  } as ReplayFrame))

  return {
    ...cloned,
    frames: normalizedFrames,
    originalFrames: normalizedOriginalFrames,
  }
}
