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

export interface PuyoSequenceAnalysis {
  colorCounts: Record<PuyoColor, number>
  firstTwoColorCount: number
  pairSameColorCount: number
  adjacentSameColorCount: number
  windowSpread: Record<8 | 16 | 32 | 64, number>
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

function createBalancedPuyos(random: () => number): PuyoColor[] {
  const puyos: PuyoColor[] = []
  for (const color of COLORS) for (let i = 0; i < SEQUENCE_COLOR_COUNT; i += 1) puyos.push(color)
  shuffle(puyos, random)
  return puyos
}

/**
 * Generate one 128-pair cycle. The cycle contains exactly 64 of each color.
 * The first two pairs are constrained to use at most three colors while
 * preserving the 64/64/64/64 totals.
 */
export function generatePuyoSequence(seed = randomSeed()): Pair[] {
  const random = mulberry32(seed)
  const puyos = createBalancedPuyos(random)

  const firstColors = new Set(puyos.slice(0, 4))
  if (firstColors.size === 4) {
    const keepColor = puyos[0]
    const replacementIndex = puyos.findIndex((color, index) => index >= 4 && color === keepColor)
    if (replacementIndex >= 0) [puyos[3], puyos[replacementIndex]] = [puyos[replacementIndex], puyos[3]]
  }

  return Array.from({ length: SEQUENCE_PAIRS }, (_, index) => ({
    axis: puyos[index * 2],
    child: puyos[index * 2 + 1],
  }))
}

/**
 * Recovery sequence for restored/legacy replay states that have no saved
 * sequence. It keeps the balanced 64/64/64/64 distribution, but deliberately
 * does not apply the initial two-pair color restriction because this is not
 * the opening sequence.
 */
function generateRecoverySequence(seed = randomSeed()): Pair[] {
  const random = mulberry32(seed)
  const puyos = createBalancedPuyos(random)
  return Array.from({ length: SEQUENCE_PAIRS }, (_, index) => ({
    axis: puyos[index * 2],
    child: puyos[index * 2 + 1],
  }))
}

export function createPuyoSequence(seed = randomSeed()): PuyoSequenceDebugState {
  return { seed: normalizeSeed(seed), sequence: generatePuyoSequence(seed), index: 0 }
}

export function nextSequencePair(state: PuyoSequenceDebugState): { pair: Pair; state: PuyoSequenceDebugState } {
  const hasSequence = Array.isArray(state.sequence) && state.sequence.length === SEQUENCE_PAIRS
  const normalized: PuyoSequenceDebugState = hasSequence
    ? { ...state, seed: normalizeSeed(state.seed), index: Math.max(0, Math.floor(state.index ?? 0)) }
    : { seed: normalizeSeed(state.seed), sequence: generateRecoverySequence(state.seed), index: 0 }

  if (normalized.index < normalized.sequence.length) {
    const pair = normalized.sequence[normalized.index]
    return { pair, state: { ...normalized, index: normalized.index + 1 } }
  }
  const nextCycle = createPuyoSequence(normalized.seed + 1)
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

function maxMinColorSpread(puyos: PuyoColor[], length: number): number {
  if (puyos.length < length) return 0
  let maxSpread = 0
  for (let start = 0; start + length <= puyos.length; start += 1) {
    const counts: Record<PuyoColor, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
    for (let i = start; i < start + length; i += 1) counts[puyos[i]] += 1
    const values = COLORS.map((color) => counts[color])
    maxSpread = Math.max(maxSpread, Math.max(...values) - Math.min(...values))
  }
  return maxSpread
}

/** Measures short-term randomness without changing the generator. */
export function analyzePuyoSequence(sequence: Pair[]): PuyoSequenceAnalysis {
  const colorCounts = getSequenceColorCounts(sequence)
  const puyos = sequence.flatMap((pair) => [pair.axis, pair.child])
  let pairSameColorCount = 0
  let adjacentSameColorCount = 0

  for (const pair of sequence) if (pair.axis === pair.child) pairSameColorCount += 1
  for (let i = 1; i < puyos.length; i += 1) if (puyos[i] === puyos[i - 1]) adjacentSameColorCount += 1

  return {
    colorCounts,
    firstTwoColorCount: getFirstTwoPairColorCount(sequence),
    pairSameColorCount,
    adjacentSameColorCount,
    windowSpread: {
      8: maxMinColorSpread(puyos, 8),
      16: maxMinColorSpread(puyos, 16),
      32: maxMinColorSpread(puyos, 32),
      64: maxMinColorSpread(puyos, 64),
    },
  }
}
