import { useState } from 'react'
import { PALETTE_COLOR_NAMES, PALETTE_OPTIONS, loadActivePalette, saveActivePalette, type ActivePalette, type PaletteColor } from '../game/palette'
import './PaletteStartModal.css'

const PALETTE_HEX: Record<PaletteColor, string> = {
  1: '#ff5b68',
  2: '#5aa7ff',
  3: '#58d68d',
  4: '#b66cff',
  5: '#ffd45a',
}

function samePalette(a: ActivePalette, b: ActivePalette): boolean {
  return a.every((color, index) => color === b[index])
}

export function PaletteStartModal({ onStart }: { onStart: () => void }) {
  const [palette, setPalette] = useState<ActivePalette>(() => loadActivePalette())

  const selectPalette = (next: ActivePalette) => setPalette([...next] as ActivePalette)

  const start = () => {
    saveActivePalette(palette)
    onStart()
  }

  return <div className="palette-start-backdrop">
    <section className="palette-start-modal" role="dialog" aria-modal="true" aria-labelledby="palette-start-title">
      <div className="palette-start-eyebrow">PUZZLE COACHING LAB</div>
      <h1 id="palette-start-title">使用するぷよの色を選択</h1>
      <p className="palette-start-description">5色の中から4色を選んでください。</p>

      <div className="palette-start-options">
        {PALETTE_OPTIONS.map((option, index) => {
          const selected = samePalette(palette, option)
          return <button
            type="button"
            key={index}
            className={`palette-start-option ${selected ? 'selected' : ''}`}
            onClick={() => selectPalette(option)}
            aria-pressed={selected}
          >
            <span className="palette-start-dots">
              {option.map(color => <span key={color} className="palette-start-dot" style={{ background: PALETTE_HEX[color] }} />)}
            </span>
            <span>{option.map(color => PALETTE_COLOR_NAMES[color]).join('・')}</span>
          </button>
        })}
      </div>

      <div className="palette-start-selected">
        使用色：{palette.map(color => PALETTE_COLOR_NAMES[color]).join('・')}
      </div>

      <button type="button" className="palette-start-button" onClick={start}>この配色で開始</button>
    </section>
  </div>
}
