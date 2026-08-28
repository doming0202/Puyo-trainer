export type GameplayAction = 'left' | 'right' | 'rotate-left' | 'rotate-right' | 'soft-drop' | 'hard-drop' | 'reset-turn' | 'undo' | 'redo'

export type KeybindSlots = [string, string]
export type Keybinds = Record<GameplayAction, KeybindSlots>

export const DEFAULT_KEYBINDS: Keybinds = {
  left: ['ArrowLeft', ''],
  right: ['ArrowRight', ''],
  'rotate-left': ['KeyZ', ''],
  'rotate-right': ['ArrowUp', ''],
  'soft-drop': ['ArrowDown', ''],
  'hard-drop': ['Space', ''],
  'reset-turn': ['KeyR', ''],
  undo: ['KeyX', ''],
  redo: ['KeyY', ''],
}

const STORAGE_KEY = 'puyo-trainer-keybinds'
const ACTIONS: GameplayAction[] = ['left', 'right', 'rotate-left', 'rotate-right', 'soft-drop', 'hard-drop', 'reset-turn', 'undo', 'redo']

function normalizeSlots(value: unknown, fallback: KeybindSlots): KeybindSlots {
  if (Array.isArray(value)) {
    return [typeof value[0] === 'string' ? value[0] : fallback[0], typeof value[1] === 'string' ? value[1] : fallback[1]]
  }
  if (typeof value === 'string') return [value, '']
  return [...fallback] as KeybindSlots
}

export function loadKeybinds(): Keybinds {
  if (typeof window === 'undefined') return structuredKeybinds(DEFAULT_KEYBINDS)
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredKeybinds(DEFAULT_KEYBINDS)
    const parsed = JSON.parse(raw) as Partial<Record<GameplayAction, unknown>>
    return ACTIONS.reduce((result, action) => {
      result[action] = normalizeSlots(parsed[action], DEFAULT_KEYBINDS[action])
      return result
    }, {} as Keybinds)
  } catch {
    return structuredKeybinds(DEFAULT_KEYBINDS)
  }
}

export function saveKeybinds(keybinds: Keybinds): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keybinds))
  } catch {
    // Ignore storage failures; the current session still works.
  }
}

export function setKeybind(keybinds: Keybinds, action: GameplayAction, slot: 0 | 1, code: string): Keybinds {
  const next = structuredKeybinds(keybinds)
  ACTIONS.forEach((otherAction) => {
    next[otherAction] = next[otherAction].map((value, index) => value === code && !(otherAction === action && index === slot) ? '' : value) as KeybindSlots
  })
  next[action][slot] = code
  return next
}

export function structuredKeybinds(keybinds: Keybinds): Keybinds {
  return ACTIONS.reduce((result, action) => {
    result[action] = [...keybinds[action]] as KeybindSlots
    return result
  }, {} as Keybinds)
}

export function resetKeybinds(): Keybinds {
  return structuredKeybinds(DEFAULT_KEYBINDS)
}

export const GAMEPLAY_ACTION_LABELS: Record<GameplayAction, string> = {
  left: '左へ移動',
  right: '右へ移動',
  'rotate-left': '左回転',
  'rotate-right': '右回転',
  'soft-drop': '落下',
  'hard-drop': 'ハードドロップ',
  'reset-turn': '現在のぷよ出現直後へ戻す',
  undo: '一手戻す',
  redo: 'やり直す',
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
