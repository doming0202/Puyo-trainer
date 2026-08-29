import type { Pair, PuyoColor } from './types'

/**
 * Development-only structural reference model.
 *
 * It is intentionally NOT a recreation of proprietary game code. It models
 * only the publicly described high-level behavior: separate 3-color and
 * 4-color pools, deterministic shuffling, and replacement of the first two
 * pairs in the 4-color result by the 3-color result.
 */
const COLORS: PuyoColor[] = [1, 2, 3, 4]
const PUYOS = 256
const PAIRS = 128

function normalizeSeed(seed: number): number {
  return (Math.floor(seed) >>> 0) || 0x6d2b79f5
}

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

function makeBalancedPool(colorCount: 3 | 4): PuyoColor[] {
  const pool: PuyoColor[] = []
  for (let i = 0; i < PUYOS; i += 1) pool.push(COLORS[i % colorCount])
  return pool
}

function shuffle<T>(items: T[], random: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
}

export function generateReferencePuyoSequence(seed: number): Pair[] {
  const random = mulberry32(seed)
  const threeColor = makeBalancedPool(3)
  const fourColor = makeBalancedPool(4)
  shuffle(threeColor, random)
  shuffle(fourColor, random)

  // Structural behavior described by public reverse-engineering material:
  // the first two pairs of the 4-color result are replaced by the 3-color
  // result. The exact original implementation is deliberately not reproduced.
  for (let i = 0; i < 4; i += 1) fourColor[i] = threeColor[i]

  return Array.from({ length: PAIRS }, (_, index) => ({
    axis: fourColor[index * 2],
    child: fourColor[index * 2 + 1],
  }))
}
