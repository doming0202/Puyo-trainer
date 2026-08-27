import type { GameState, PlayerState } from './types'

export interface ReplayFrame {
  tick: number
  players: [PlayerState, PlayerState]
  activePlayer: 0 | 1
}

export interface ReplayState {
  frames: ReplayFrame[]
  cursor: number
  playing: boolean
  speed: number
}

export const REPLAY_SPEEDS = [0.25, 0.5, 1, 2, 4] as const

export function clonePlayer(player: PlayerState): PlayerState {
  return {
    ...player,
    board: player.board.map((row) => [...row]),
    current: { ...player.current, pair: { ...player.current.pair } },
    next: player.next.map((pair) => ({ ...pair })),
  }
}

export function captureFrame(game: GameState): ReplayFrame {
  return {
    tick: game.tick,
    players: [clonePlayer(game.players[0]), clonePlayer(game.players[1])],
    activePlayer: game.activePlayer,
  }
}

export function createReplay(game: GameState): ReplayState {
  return { frames: [captureFrame(game)], cursor: 0, playing: false, speed: 1 }
}

export function appendFrame(replay: ReplayState, game: GameState): ReplayState {
  const frame = captureFrame(game)
  const last = replay.frames[replay.frames.length - 1]
  if (last && last.tick === frame.tick) return replay
  const frames = replay.frames.slice(0, replay.cursor + 1)
  frames.push(frame)
  return { ...replay, frames, cursor: frames.length - 1 }
}

export function frameToGame(frame: ReplayFrame, running = false): GameState {
  return {
    players: [clonePlayer(frame.players[0]), clonePlayer(frame.players[1])],
    activePlayer: frame.activePlayer,
    running,
    tick: frame.tick,
  }
}

export function moveCursor(replay: ReplayState, delta: number): ReplayState {
  const cursor = Math.max(0, Math.min(replay.frames.length - 1, replay.cursor + delta))
  return { ...replay, cursor }
}

export function resetReplay(game: GameState): ReplayState {
  return createReplay(game)
}
