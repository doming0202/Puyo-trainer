import type { Pair, PuyoColor } from './types'

/**
 * Development-only reference model based on the publicly documented modern
 * Puyo queue structure: separate 3-color / 4-color pools, local shuffles,
 * then copy the first two pairs from the 3-color pool into the 4-color pool.
 *
 * This is intentionally NOT used by the game engine. It exists so the trainer
 * can compare the current generator against a documented reference structure
 * without claiming an exact proprietary implementation.
 */
const COLORS: PuyoColor[] = [1, 2, 3, 4]
const REFERENCE_PUYOS = 256

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

function makePool(colorCount: 3 | 4): PuyoColor[] {
  const pool: PuyoColor[] = []
  const colors = COLORS.slice(0, colorCount)
  for (let color = 0; color < colors.length; color += 1) {
    for (let i = 0; i < REFERENCE_PUYOS / colors.length; i += 1) pool.push(colors[color])
  }
  return pool
}

function swap<T>(items: T[], a: number, b: number): void {
  ;[items[a], items[b]] = [items[b], items[a]]
}

/** Approximation of the documented staged local-shuffle structure. */
function stagedShuffle(items: PuyoColor[], random: () => number): void {
  for (let blockSize = 16; blockSize < REFERENCE_PUYOS; blockSize *= 2) {
    const blocks = REFERENCE_PUYOS / blockSize
    for (let block = 0; block < blocks - 1; block += 1) {
      const left = block * blockSize
      const right = (block + 1) * blockSize
      for (let i = 0; i < blockSize / 2; i += 1) {
        const a = left + Math.floor(random() * blockSize)
        const b = right + Math.floor(random() * blockSize)
        swap(items, a, b)
      }
    }
  }
}

export function generateReferencePuyoSequence(seed: number): Pair[] {
  const random = mulberry32(seed)
  const threeColor = makePool(3)
  const fourColor = makePool(4)
  stagedShuffle(threeColor, random)
  stagedShuffle(fourColor, random)

  // Modern documented behavior: the opening two pairs are restricted to the
  // three-color pool while the remainder comes from the four-color pool.
  for (let i = 0; i < 4; i += 1) fourColor[i] = threeColor[i]

  return Array.from({ length: 128 }, (_, index) => ({
    axis: fourColor[index * 2],
    child: fourColor[index * 2 + 1],
  }))
}
