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
const STYLE_ID = 'puyo-trainer-palette-runtime'

const COLOR_HEX: Record<PaletteColor, string> = {
  1: '#ff5b68',
  2: '#5aa7ff',
  3: '#58d68d',
  4: '#b66cff',
  5: '#ffd45a',
}

const COLOR_RGB: Record<PaletteColor, string> = {
  1: 'rgb(255, 91, 104)',
  2: 'rgb(90, 167, 255)',
  3: 'rgb(88, 214, 141)',
  4: 'rgb(182, 108, 255)',
  5: 'rgb(255, 212, 90)',
}

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

function applyPaletteStyle(palette: ActivePalette): void {
  if (typeof document === 'undefined') return

  const oldColors = [1, 2, 3, 4] as PaletteColor[]
  const rules = oldColors.map((internalColor, index) => {
    const displayColor = palette[index]
    const selectors = [
      `.puyo[style*="${COLOR_HEX[internalColor]}"]`,
      `.puyo[style*="${COLOR_RGB[internalColor]}"]`,
      `.mini-puyo[style*="${COLOR_HEX[internalColor]}"]`,
      `.mini-puyo[style*="${COLOR_RGB[internalColor]}"]`,
      `.context-dot[style*="${COLOR_HEX[internalColor]}"]`,
      `.context-dot[style*="${COLOR_RGB[internalColor]}"]`,
    ].join(',\n')
    return `${selectors} { background: ${COLOR_HEX[displayColor]} !important; }`
  }).join('\n')

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  if (style.textContent !== rules) style.textContent = rules
}

export function saveActivePalette(palette: ActivePalette): void {
  if (!isPalette(palette)) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(palette))
  } catch {
    // Ignore storage failures; the current session can continue using the palette.
  }
  applyPaletteStyle(palette)
  window.dispatchEvent(new CustomEvent('puyo-palette-changed'))
}

export function getActiveColors(): ActivePalette {
  return loadActivePalette()
}

if (typeof window !== 'undefined') {
  applyPaletteStyle(loadActivePalette())
}
