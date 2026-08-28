import { useEffect, useState } from 'react'
import { GAMEPLAY_ACTION_LABELS, formatKeyCode, resetKeybinds, setKeybind, type GameplayAction, type Keybinds } from '../game/keybinds'
import { PALETTE_COLOR_NAMES, PALETTE_OPTIONS, loadActivePalette, saveActivePalette, type ActivePalette, type PaletteColor } from '../game/palette'
import './KeybindModal.css'

const ACTIONS: GameplayAction[] = ['left', 'right', 'rotate-left', 'rotate-right', 'soft-drop', 'hard-drop', 'reset-turn', 'undo', 'redo']

type ListeningTarget = { action: GameplayAction; slot: 0 | 1 } | null

type Props = {
  keybinds: Keybinds
  onChange: (keybinds: Keybinds) => void
  onClose: () => void
}

const PALETTE_HEX: Record<PaletteColor, string> = {
  1: '#ff5b68',
  2: '#5aa7ff',
  3: '#58d68d',
  4: '#b66cff',
  5: '#ffd45a',
}

function eventToBinding(event: KeyboardEvent): string {
  const modifiers: string[] = []
  if (event.ctrlKey) modifiers.push('Ctrl')
  if (event.shiftKey) modifiers.push('Shift')
  if (event.altKey) modifiers.push('Alt')
  if (event.metaKey) modifiers.push('Win')
  return [...modifiers, event.code].join('+')
}

function isModifierOnly(code: string): boolean {
  return code === 'ShiftLeft' || code === 'ShiftRight' || code === 'ControlLeft' || code === 'ControlRight' || code === 'AltLeft' || code === 'AltRight' || code === 'MetaLeft' || code === 'MetaRight'
}

function samePalette(a: ActivePalette, b: ActivePalette): boolean {
  return a.every((color, index) => color === b[index])
}

export function KeybindModal({ keybinds, onChange, onClose }: Props) {
  const [listening, setListening] = useState<ListeningTarget>(null)
  const [palette, setPalette] = useState<ActivePalette>(() => loadActivePalette())

  useEffect(() => {
    if (!listening) return
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.code === 'Escape' && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
        setListening(null)
        return
      }
      if (isModifierOnly(event.code)) return
      onChange(setKeybind(keybinds, listening.action, listening.slot, eventToBinding(event)))
      setListening(null)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [keybinds, listening, onChange])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Escape' || listening) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [listening, onClose])

  const selectPalette = (next: ActivePalette) => {
    if (samePalette(palette, next)) return
    setPalette(next)
    saveActivePalette(next)
  }

  const resetPalette = () => {
    const initial = [...PALETTE_OPTIONS[0]] as ActivePalette
    setPalette(initial)
    saveActivePalette(initial)
  }

  return <div className="keybind-modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="keybind-modal" role="dialog" aria-modal="true" aria-labelledby="keybind-title" onMouseDown={event => event.stopPropagation()}>
      <div className="keybind-modal-header">
        <div>
          <div className="aside-label">KEYBINDS</div>
          <h3 id="keybind-title">キーバインド設定</h3>
          <p>ゲーム操作は現在フォーカスしているプレイヤーに適用されます。</p>
        </div>
        <button className="keybind-close" onClick={onClose} aria-label="キーバインド設定を閉じる">×</button>
      </div>

      <div className="keybind-focus-help"><strong>フォーカス切替</strong><span>Ctrl + 1 → Player A　・　Ctrl + 2 → Player B</span></div>

      <div className="keybind-palette">
        <div className="keybind-palette-header"><strong>使用する4色</strong><span>5色から1組を選択</span></div>
        <div className="keybind-palette-options">
          {PALETTE_OPTIONS.map((option, index) => {
            const selected = samePalette(palette, option)
            return <button type="button" key={index} className={`keybind-palette-option ${selected ? 'selected' : ''}`} onClick={() => selectPalette(option)} aria-pressed={selected}>
              <span className="keybind-palette-dots">{option.map(color => <span key={color} className="keybind-palette-dot" style={{ background: PALETTE_HEX[color] }} />)}</span>
              <span>{option.map(color => PALETTE_COLOR_NAMES[color]).join('・')}</span>
            </button>
          })}
        </div>
        <div className="keybind-palette-footer">
          <small>変更した配色は次の「新しいゲーム」から使用します。</small>
          <button type="button" onClick={resetPalette}>初期配色に戻す</button>
        </div>
      </div>

      <div className="keybind-list">
        {ACTIONS.map(action => <div className="keybind-row" key={action}>
          <div className="keybind-action">{GAMEPLAY_ACTION_LABELS[action]}</div>
          <div className="keybind-slots">
            {[0, 1].map(slot => {
              const selected = listening?.action === action && listening.slot === slot
              return <button key={slot} className={`keybind-key ${slot === 1 ? 'secondary' : ''} ${selected ? 'listening' : ''}`} onClick={() => setListening({ action, slot: slot as 0 | 1 })}>
                <small>{slot === 0 ? '主' : '副'}</small>
                <span>{selected ? 'キーを押してください' : formatKeyCode(keybinds[action][slot as 0 | 1])}</span>
              </button>
            })}
          </div>
        </div>)}
      </div>

      <div className="keybind-modal-footer">
        <span>副キー対応 / Ctrl・Shift・Alt・Win の組み合わせも登録可能 / Esc：変更待ち解除・モーダルを閉じる</span>
        <button onClick={() => { onChange(resetKeybinds()); setListening(null) }}>初期設定に戻す</button>
      </div>
    </section>
  </div>
}
