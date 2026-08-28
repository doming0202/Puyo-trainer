export type PaletteColor = 1 | 2 | 3 | 4 | 5
export type ColorPalette = readonly [PaletteColor, PaletteColor, PaletteColor, PaletteColor]

export const PALETTE_COLORS: readonly PaletteColor[] = [1, 2, 3, 4, 5]

export const PALETTE_COLOR_NAMES: Record<PaletteColor, string> = {
  1: '赤',
  2: '青',
  3: '緑',
  4: '紫',
  5: '黄',
}

export const PALETTE_COLOR_HEX: Record<PaletteColor, string> = {
  1: '#ff5b68',
  2: '#5aa7ff',
  3: '#58d68d',
  4: '#b66cff',
  5: '#ffd45a',
}

/**
 * The five possible ways to choose four colors from the five-color pool.
 * The default keeps the original four-color palette (red/blue/green/purple).
 */
export const COLOR_PALETTE_OPTIONS: readonly ColorPalette[] = [
  [1, 2, 3, 4],
  [1, 2, 3, 5],
  [1, 2, 4, 5],
  [1, 3, 4, 5],
  [2, 3, 4, 5],
]

const STORAGE_KEY = 'puyo-trainer-color-palette-v1'

function isPaletteColor(value: unknown): value is PaletteColor {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5
}

export function isColorPalette(value: unknown): value is ColorPalette {
  if (!Array.isArray(value) || value.length !== 4) return false
  if (!value.every(isPaletteColor)) return false
  return new Set(value).size === 4
}

export function loadColorPalette(): ColorPalette {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (isColorPalette(parsed)) {
      const matching = COLOR_PALETTE_OPTIONS.find(option => option.every((color, index) => color === parsed[index]))
      if (matching) return matching
    }
  } catch {
    // Fall back to the default palette.
  }
  return COLOR_PALETTE_OPTIONS[0]
}

export function saveColorPalette(palette: ColorPalette): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(palette))
}
