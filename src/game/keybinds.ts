export type GameplayAction = 'left' | 'right' | 'rotate-left' | 'rotate-right' | 'soft-drop' | 'hard-drop'

export type Keybinds = Record<GameplayAction, string>

export const DEFAULT_KEYBINDS: Keybinds = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  'rotate-left': 'KeyZ',
  'rotate-right': 'ArrowUp',
  'soft-drop': 'ArrowDown',
  'hard-drop': 'Space',
}

const STORAGE_KEY = 'puyo-trainer-keybinds'

export function loadKeybinds(): Keybinds {
  if (typeof window === 'undefined') return { ...DEFAULT_KEYBINDS }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_KEYBINDS }
    const parsed = JSON.parse(raw) as Partial<Keybinds>
    return {
      ...DEFAULT_KEYBINDS,
      ...parsed,
    }
  } catch {
    return { ...DEFAULT_KEYBINDS }
  }
}

export function saveKeybinds(keybinds: Keybinds): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keybinds))
  } catch {
    // Ignore storage failures; the current session still works.
  }
}

export function setKeybind(keybinds: Keybinds, action: GameplayAction, code: string): Keybinds {
  const next = { ...keybinds }
  ;(Object.keys(next) as GameplayAction[]).forEach((otherAction) => {
    if (otherAction !== action && next[otherAction] === code) next[otherAction] = ''
  })
  next[action] = code
  return next
}

export function resetKeybinds(): Keybinds {
  return { ...DEFAULT_KEYBINDS }
}

export const GAMEPLAY_ACTION_LABELS: Record<GameplayAction, string> = {
  left: '左へ移動',
  right: '右へ移動',
  'rotate-left': '左回転',
  'rotate-right': '右回転',
  'soft-drop': '落下',
  'hard-drop': 'ハードドロップ',
}

export function formatKeyCode(code: string): string {
  if (!code) return '未設定'
  if (code === 'Space') return 'Space'
  if (code.startsWith('Arrow')) return code.replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('ArrowUp', '↑').replace('ArrowDown', '↓')
  if (code.startsWith('Key')) return code.slice(3).toUpperCase()
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`
  if (code === 'Enter') return 'Enter'
  if (code === 'Escape') return 'Esc'
  if (code === 'Backspace') return 'Backspace'
  if (code === 'Tab') return 'Tab'
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift'
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl'
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt'
  return code
}
