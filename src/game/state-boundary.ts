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
export function stripTransientPlayerState<T extends PlayerState | TurnState>(player: T): T {
  return { ...player, paused: false }
}

export function gameForPersistence(game: GameState): GameState {
  return {
    ...structuredClone(game),
    players: [stripTransientPlayerState(game.players[0]), stripTransientPlayerState(game.players[1])],
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
  const normalizedFrames = replay.frames.map((frame) => ({
    ...frame,
    players: [
      stripTransientPlayerState(structuredClone(frame.players[0])),
      stripTransientPlayerState(structuredClone(frame.players[1])),
    ],
  } as ReplayFrame))

  return {
    ...structuredClone(replay),
    frames: normalizedFrames,
  }
}
