export type GameplayAction = 'left' | 'right' | 'rotate-left' | 'rotate-right' | 'soft-drop' | 'hard-drop' | 'reset-turn' | 'undo' | 'redo'

export type KeybindSlots = [string, string]
export type Keybinds = Record<GameplayAction, KeybindSlots>

export const DEFAULT_KEYBINDS: Keybinds = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  'rotate-left': ['KeyQ', 'KeyJ'],
  'rotate-right': ['KeyE', 'KeyK'],
  'soft-drop': ['KeyS', 'ArrowDown'],
  'hard-drop': ['Space', 'ArrowUp'],
  'reset-turn': ['KeyR', ''],
  undo: ['KeyZ', ''],
  redo: ['KeyY', ''],
}

const STORAGE_KEY = 'puyo-trainer-keybinds-v2'
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
    const result = ACTIONS.reduce((next, action) => {
      next[action] = normalizeSlots(parsed[action], DEFAULT_KEYBINDS[action])
      return next
    }, {} as Keybinds)

    // Migrate the previous history binding where Y meant undo.
    const hadLegacyUndoY = !parsed.redo && (result.undo[0] === 'KeyY' || result.undo[1] === 'KeyY')
    if (hadLegacyUndoY) {
      result.undo = [...DEFAULT_KEYBINDS.undo] as KeybindSlots
      result.redo = [...DEFAULT_KEYBINDS.redo] as KeybindSlots
    }

    // The previous default accidentally used W for right rotation. Only
    // migrate the exact old default so intentionally customized bindings stay intact.
    const hadLegacyDefaultRightRotation = Array.isArray(parsed['rotate-right'])
      && parsed['rotate-right']?.[0] === 'KeyW'
      && parsed['rotate-right']?.[1] === 'KeyK'
    if (hadLegacyDefaultRightRotation) {
      result['rotate-right'] = [...DEFAULT_KEYBINDS['rotate-right']] as KeybindSlots
      saveKeybinds(result)
    }

    return result
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
  'rotate-left': '⟳ 左回転',
  'rotate-right': '⟳ 右回転',
  'soft-drop': '落下',
  'hard-drop': 'ハードドロップ',
  'reset-turn': '⟳ 現在のぷよを最初から',
  undo: '↶ 一手戻す',
  redo: '↷ やり直す',
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
