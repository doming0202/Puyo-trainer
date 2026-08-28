import type { GameState, PlayerState, TurnState } from './types'

export interface ReplayFrame {
  tick: number
  elapsedMs: number
  players: [PlayerState, PlayerState]
  activePlayer: 0 | 1
}

export interface ReplayState {
  frames: ReplayFrame[]
  cursor: number
  playing: boolean
  speed: number
  /** Original timeline kept intact after the first divergent edit. */
  originalFrames?: ReplayFrame[]
  /** Elapsed time where the active branch first diverged from Original. */
  branchOriginElapsedMs?: number
}

export interface TimelineBranchInfo {
  forkElapsedMs: number
  originalDurationMs: number
}

declare global {
  interface Window {
    __puyoTimelineBranch?: TimelineBranchInfo
  }
}

export const REPLAY_SPEEDS = [0.25, 0.5, 1, 2, 4] as const

function cloneTurnState(state: TurnState | undefined, fallback: PlayerState): TurnState {
  if (!state) {
    return {
      board: fallback.board.map((row) => [...row]),
      hidden: fallback.hidden.map((row) => [...row]),
      current: { ...fallback.current, pair: { ...fallback.current.pair } },
      next: fallback.next.map((pair) => ({ ...pair })),
      garbage: fallback.garbage,
      score: fallback.score,
      chain: fallback.chain,
      controlMode: fallback.controlMode,
      alive: fallback.alive,
      resolution: fallback.resolution ? structuredClone(fallback.resolution) : undefined,
      fallElapsedMs: fallback.fallElapsedMs ?? 0,
      lockElapsedMs: fallback.lockElapsedMs ?? 0,
      quickTurnArmed: fallback.quickTurnArmed ?? false,
    }
  }
  return state
}

/**
 * Clone only the gameplay state needed by a replay frame.
 * Undo/redo history is immutable and shared instead of deep-cloned per frame.
 */
export function clonePlayer(player: PlayerState): PlayerState {
  const normalizedTurnStart = cloneTurnState(player.turnStart, player)
  return {
    ...player,
    board: player.board.map((row) => [...row]),
    hidden: player.hidden.map((row) => [...row]),
    current: { ...player.current, pair: { ...player.current.pair } },
    next: player.next.map((pair) => ({ ...pair })),
    fallElapsedMs: player.fallElapsedMs ?? 0,
    lockElapsedMs: player.lockElapsedMs ?? 0,
    quickTurnArmed: player.quickTurnArmed ?? false,
    turnStart: normalizedTurnStart,
    undoStack: player.undoStack ?? [],
    redoStack: player.redoStack ?? [],
  }
}

function cloneFrames(frames: ReplayFrame[]): ReplayFrame[] {
  return frames.map((frame) => ({
    ...frame,
    players: [clonePlayer(frame.players[0]), clonePlayer(frame.players[1])],
  } as ReplayFrame))
}

function publishBranchInfo(info: TimelineBranchInfo): void {
  if (typeof window === 'undefined') return
  window.__puyoTimelineBranch = info
  window.dispatchEvent(new CustomEvent<TimelineBranchInfo>('puyo-timeline-branch', { detail: info }))
}

function clearBranchInfo(): void {
  if (typeof window === 'undefined') return
  delete window.__puyoTimelineBranch
  window.dispatchEvent(new Event('puyo-timeline-branch-cleared'))
}

export function captureFrame(game: GameState, elapsedMs = 0): ReplayFrame {
  return {
    tick: game.tick,
    elapsedMs: Math.max(0, elapsedMs),
    players: [clonePlayer(game.players[0]), clonePlayer(game.players[1])],
    activePlayer: game.activePlayer,
  }
}

export function createReplay(game: GameState): ReplayState {
  clearBranchInfo()
  return { frames: [captureFrame(game, 0)], cursor: 0, playing: false, speed: 1 }
}

export function appendFrame(replay: ReplayState, game: GameState, elapsedMs?: number): ReplayState {
  const currentFrame = replay.frames[replay.cursor]
  const diverging = replay.cursor < replay.frames.length - 1

  // When continuing from a rewound position, elapsed time must continue from
  // that position rather than from the Original timeline's final frame.
  // Otherwise the first resumed frame jumps to the old timeline end and the
  // active timeline effectively gets stuck at the bottom.
  const baseElapsed = diverging
    ? (currentFrame?.elapsedMs ?? 0)
    : (replay.frames[replay.frames.length - 1]?.elapsedMs ?? 0)
  const nextElapsed = Math.max(baseElapsed, elapsedMs ?? baseElapsed)
  const frame = captureFrame(game, nextElapsed)

  const last = replay.frames[replay.frames.length - 1]
  if (!diverging && last && last.tick === frame.tick) {
    if (nextElapsed <= last.elapsedMs) return replay
    const frames = replay.frames.slice()
    frames[frames.length - 1] = frame
    return { ...replay, frames }
  }

  let originalFrames = replay.originalFrames
  let branchOriginElapsedMs = replay.branchOriginElapsedMs

  // The first edit made after rewinding creates a branch. Keep an immutable
  // copy of the complete pre-branch timeline before truncating the active one.
  if (diverging && !originalFrames) {
    originalFrames = cloneFrames(replay.frames)
    branchOriginElapsedMs = currentFrame?.elapsedMs ?? 0
    publishBranchInfo({
      forkElapsedMs: branchOriginElapsedMs,
      originalDurationMs: originalFrames[originalFrames.length - 1]?.elapsedMs ?? branchOriginElapsedMs,
    })
  }

  const frames = replay.frames.slice(0, replay.cursor + 1)
  frames.push(frame)
  return {
    ...replay,
    frames,
    cursor: frames.length - 1,
    originalFrames,
    branchOriginElapsedMs,
  }
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

export function findFrameAtElapsed(frames: ReplayFrame[], elapsedMs: number): number {
  if (frames.length === 0) return 0
  const target = Math.max(0, elapsedMs)
  let low = 0
  let high = frames.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (frames[mid].elapsedMs <= target) low = mid + 1
    else high = mid - 1
  }
  return Math.max(0, Math.min(frames.length - 1, high))
}

export function resetReplay(game: GameState): ReplayState {
  return createReplay(game)
}
