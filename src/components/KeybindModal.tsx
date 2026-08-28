import { useEffect, useState } from 'react'
import { GAMEPLAY_ACTION_LABELS, formatKeyCode, resetKeybinds, setKeybind, type GameplayAction, type Keybinds } from '../game/keybinds'
import { COLOR_PALETTE_OPTIONS, loadColorPalette, PALETTE_COLOR_HEX, PALETTE_COLOR_NAMES, saveColorPalette, type ColorPalette } from '../game/palette'
import './KeybindModal.css'

const ACTIONS: GameplayAction[] = ['left', 'right', 'rotate-left', 'rotate-right', 'soft-drop', 'hard-drop', 'reset-turn', 'undo', 'redo']

type ListeningTarget = { action: GameplayAction; slot: 0 | 1 } | null

type Props = {
  keybinds: Keybinds
  onChange: (keybinds: Keybinds) => void
  onClose: () => void
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

function paletteLabel(palette: ColorPalette): string {
  return palette.map(color => PALETTE_COLOR_NAMES[color]).join('・')
}

export function KeybindModal({ keybinds, onChange, onClose }: Props) {
  const [listening, setListening] = useState<ListeningTarget>(null)
  const [palette, setPalette] = useState<ColorPalette>(() => loadColorPalette())

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

  const selectPalette = (next: ColorPalette) => {
    setPalette(next)
    saveColorPalette(next)
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

      <div className="palette-settings">
        <div className="palette-settings-header">
          <div>
            <strong>使用する4色</strong>
            <span>5色の中から最初に4色の組み合わせを選択します。</span>
          </div>
          <span className="palette-current">現在：{paletteLabel(palette)}</span>
        </div>
        <div className="palette-options">
          {COLOR_PALETTE_OPTIONS.map(option => {
            const selected = option.every((color, index) => color === palette[index])
            return <button key={option.join('-')} type="button" className={`palette-option ${selected ? 'selected' : ''}`} onClick={() => selectPalette(option)} aria-pressed={selected}>
              <div className="palette-dots">{option.map(color => <span key={color} className="palette-dot" style={{ background: PALETTE_COLOR_HEX[color] }} />)}</div>
              <span className="palette-option-label">{paletteLabel(option)}</span>
              {selected && <span className="palette-selected-mark">使用中</span>}
            </button>
          })}
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
