export type PaletteColor = 1 | 2 | 3 | 4 | 5
export type ActivePalette = [PaletteColor, PaletteColor, PaletteColor, PaletteColor]

export const PALETTE_OPTIONS: ActivePalette[] = [
  [1, 2, 3, 4],
  [1, 2, 3, 5],
  [1, 2, 4, 5],
  [1, 3, 4, 5],
  [2, 3, 4, 5],
]

export const PALETTE_COLOR_NAMES: Record<PaletteColor, string> = {
  1: '赤',
  2: '青',
  3: '緑',
  4: '紫',
  5: '黄',
}

const STORAGE_KEY = 'puyo-trainer-active-palette-v1'

function isPalette(value: unknown): value is ActivePalette {
  if (!Array.isArray(value) || value.length !== 4) return false
  const values = value as unknown[]
  return values.every((color): color is PaletteColor => typeof color === 'number' && color >= 1 && color <= 5) && new Set(values).size === 4
}

export function loadActivePalette(): ActivePalette {
  if (typeof window === 'undefined') return [...PALETTE_OPTIONS[0]] as ActivePalette
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (isPalette(parsed) && PALETTE_OPTIONS.some((option) => option.every((color, index) => color === parsed[index]))) {
      return [...parsed] as ActivePalette
    }
  } catch {
    // Fall back to the default palette when storage is unavailable or invalid.
  }
  return [...PALETTE_OPTIONS[0]] as ActivePalette
}

export function saveActivePalette(palette: ActivePalette): void {
  if (!isPalette(palette)) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(palette))
  } catch {
    // Ignore storage failures; the current session can continue using the palette.
  }
}

export function getActiveColors(): ActivePalette {
  return loadActivePalette()
}
