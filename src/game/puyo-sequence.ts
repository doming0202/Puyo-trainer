import type { Pair, PuyoColor } from './types'

export const SEQUENCE_PAIRS = 128
export const SEQUENCE_PUYOS = SEQUENCE_PAIRS * 2
export const SEQUENCE_COLOR_COUNT = 64

const COLORS: PuyoColor[] = [1, 2, 3, 4]

export interface PuyoSequenceDebugState {
  seed: number
  sequence: Pair[]
  index: number
}

const debugStates: Array<PuyoSequenceDebugState | undefined> = [undefined, undefined]

function normalizeSeed(seed: number): number {
  return (Math.floor(seed) >>> 0) || 0x6d2b79f5
}

/** Small deterministic PRNG. The generator is intentionally independent of Math.random. */
function mulberry32(seed: number): () => number {
  let state = normalizeSeed(seed)
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const value = new Uint32Array(1)
    crypto.getRandomValues(value)
    return normalizeSeed(value[0])
  }
  return normalizeSeed(Math.floor(Math.random() * 0x100000000))
}

function shuffle<T>(items: T[], random: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
}

/**
 * Generate one 128-pair cycle. The cycle contains exactly 64 of each color
 * before the first-two-pair restriction is applied. The restriction only
 * rearranges cells, so the final cycle still has exactly 64 of each color.
 */
export function generatePuyoSequence(seed = randomSeed()): Pair[] {
  const random = mulberry32(seed)
  const puyos: PuyoColor[] = []
  for (const color of COLORS) for (let i = 0; i < SEQUENCE_COLOR_COUNT; i += 1) puyos.push(color)
  shuffle(puyos, random)

  // The first two pairs may use at most three colors. If all four colors are
  // present, exchange the fourth first-four cell with a later cell matching
  // one of the first three colors. This preserves the 64/64/64/64 totals.
  const firstColors = new Set(puyos.slice(0, 4))
  if (firstColors.size === 4) {
    const keep = puyos[0]
    const replacementIndex = puyos.findIndex((color, index) => index >= 4 && color === keep)
    if (replacementIndex >= 0) [puyos[0], puyos[replacementIndex]] = [puyos[replacementIndex], puyos[0]]
  }

  return Array.from({ length: SEQUENCE_PAIRS }, (_, index) => ({
    axis: puyos[index * 2],
    child: puyos[index * 2 + 1],
  }))
}

export function createPuyoSequence(seed = randomSeed()): PuyoSequenceDebugState {
  return { seed: normalizeSeed(seed), sequence: generatePuyoSequence(seed), index: 0 }
}

export function nextSequencePair(state: PuyoSequenceDebugState): { pair: Pair; state: PuyoSequenceDebugState } {
  if (state.index < state.sequence.length) {
    const pair = state.sequence[state.index]
    return { pair, state: { ...state, index: state.index + 1 } }
  }
  const nextCycle = createPuyoSequence(state.seed + 1)
  return { pair: nextCycle.sequence[0], state: { ...nextCycle, index: 1 } }
}

export function installSequenceDebugState(playerIndex: 0 | 1, state: PuyoSequenceDebugState): void {
  debugStates[playerIndex] = state
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('puyo-sequence-debug', { detail: { playerIndex, state } }))
  }
}

export function getSequenceDebugState(playerIndex: 0 | 1): PuyoSequenceDebugState | undefined {
  return debugStates[playerIndex]
}

export function getSequenceColorCounts(sequence: Pair[]): Record<PuyoColor, number> {
  const counts: Record<PuyoColor, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for (const pair of sequence) {
    counts[pair.axis] += 1
    counts[pair.child] += 1
  }
  return counts
}

export function getFirstTwoPairColorCount(sequence: Pair[]): number {
  const colors = new Set<PuyoColor>()
  for (const pair of sequence.slice(0, 2)) {
    colors.add(pair.axis)
    colors.add(pair.child)
  }
  return colors.size
}
