import type { GameState, PlayerState, TurnState } from './types'
import { createPuyoSequence, SEQUENCE_PAIRS } from './puyo-sequence'

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
  originalFrames?: ReplayFrame[]
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
      puyoSequence: Array.isArray(fallback.puyoSequence) ? fallback.puyoSequence.map((pair) => ({ ...pair })) : createPuyoSequence(fallback.puyoSequenceSeed).sequence,
      puyoSequenceIndex: Math.max(0, Math.floor(fallback.puyoSequenceIndex ?? 0)),
      puyoSequenceSeed: fallback.puyoSequenceSeed ?? createPuyoSequence().seed,
      incomingGarbage: fallback.incomingGarbage ?? fallback.garbage ?? 0,
      garbage: fallback.garbage ?? fallback.incomingGarbage ?? 0,
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
  const sequence = Array.isArray(state.puyoSequence) && state.puyoSequence.length === SEQUENCE_PAIRS
    ? state.puyoSequence.map((pair) => ({ ...pair }))
    : (Array.isArray(fallback.puyoSequence) && fallback.puyoSequence.length === SEQUENCE_PAIRS
      ? fallback.puyoSequence.map((pair) => ({ ...pair }))
      : createPuyoSequence(state.puyoSequenceSeed ?? fallback.puyoSequenceSeed).sequence)
  return {
    ...state,
    board: state.board.map((row) => [...row]),
    hidden: state.hidden.map((row) => [...row]),
    current: { ...state.current, pair: { ...state.current.pair } },
    next: state.next.map((pair) => ({ ...pair })),
    puyoSequence: sequence,
    puyoSequenceIndex: Math.max(0, Math.floor(state.puyoSequenceIndex ?? fallback.puyoSequenceIndex ?? 0)),
    puyoSequenceSeed: state.puyoSequenceSeed ?? fallback.puyoSequenceSeed,
    resolution: state.resolution ? structuredClone(state.resolution) : undefined,
  }
}

export function clonePlayer(player: PlayerState): PlayerState {
  const normalizedTurnStart = cloneTurnState(player.turnStart, player)
  const incomingGarbage = player.incomingGarbage ?? player.garbage ?? 0
  const garbage = player.garbage ?? incomingGarbage
  const sequence = Array.isArray(player.puyoSequence) && player.puyoSequence.length === SEQUENCE_PAIRS
    ? player.puyoSequence.map((pair) => ({ ...pair }))
    : createPuyoSequence(player.puyoSequenceSeed).sequence
  return {
    ...player,
    incomingGarbage,
    garbage,
    puyoSequence: sequence,
    puyoSequenceIndex: Math.max(0, Math.floor(player.puyoSequenceIndex ?? 0)),
    puyoSequenceSeed: player.puyoSequenceSeed ?? createPuyoSequence().seed,
    board: player.board.map((row) => [...row]),
    hidden: player.hidden.map((row) => [...row]),
    current: { ...player.current, pair: { ...player.current.pair } },
    next: player.next.map((pair) => ({ ...pair })),
    fallElapsedMs: player.fallElapsedMs ?? 0,
    lockElapsedMs: player.lockElapsedMs ?? 0,
    quickTurnArmed: player.quickTurnArmed ?? false,
    turnStart: normalizedTurnStart,
    undoStack: (player.undoStack ?? []).map((state) => cloneTurnState(state, player)),
    redoStack: (player.redoStack ?? []).map((entry) => ({
      ...entry,
      state: cloneTurnState(entry.state, player),
      turnStart: cloneTurnState(entry.turnStart, player),
      undoStack: (entry.undoStack ?? []).map((state) => cloneTurnState(state, player)),
    })),
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
  const baseElapsed = diverging
    ? (currentFrame?.elapsedMs ?? 0)
    : (replay.frames[replay.frames.length - 1]?.elapsedMs ?? 0)
  const requestedElapsed = elapsedMs ?? baseElapsed
  const nextElapsed = diverging
    ? Math.max(baseElapsed + 50, requestedElapsed)
    : Math.max(baseElapsed, requestedElapsed)
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
  return { ...replay, frames, cursor: frames.length - 1, originalFrames, branchOriginElapsedMs }
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
