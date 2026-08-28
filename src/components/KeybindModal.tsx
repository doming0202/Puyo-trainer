import { useEffect, useState } from 'react'
import { GAMEPLAY_ACTION_LABELS, formatKeyCode, resetKeybinds, setKeybind, type GameplayAction, type Keybinds } from '../game/keybinds'
import './KeybindModal.css'

const ACTIONS: GameplayAction[] = ['left', 'right', 'rotate-left', 'rotate-right', 'soft-drop', 'hard-drop']

type Props = {
  keybinds: Keybinds
  onChange: (keybinds: Keybinds) => void
  onClose: () => void
}

export function KeybindModal({ keybinds, onChange, onClose }: Props) {
  const [listening, setListening] = useState<GameplayAction | null>(null)

  useEffect(() => {
    if (!listening) return
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.code === 'Escape') {
        setListening(null)
        return
      }
      if (event.ctrlKey || event.altKey || event.metaKey || event.code === 'ShiftLeft' || event.code === 'ShiftRight' || event.code === 'ControlLeft' || event.code === 'ControlRight' || event.code === 'AltLeft' || event.code === 'AltRight') return
      onChange(setKeybind(keybinds, listening, event.code))
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

      <div className="keybind-list">
        {ACTIONS.map(action => <div className={`keybind-row ${listening === action ? 'listening' : ''}`} key={action}>
          <div className="keybind-action">{GAMEPLAY_ACTION_LABELS[action]}</div>
          <button className="keybind-key" onClick={() => setListening(action)}>
            {listening === action ? 'キーを押してください' : formatKeyCode(keybinds[action])}
          </button>
        </div>)}
      </div>

      <div className="keybind-modal-footer">
        <span>Esc：設定を閉じる / 変更待ちを解除</span>
        <button onClick={() => { onChange(resetKeybinds()); setListening(null) }}>初期設定に戻す</button>
      </div>
    </section>
  </div>
}
