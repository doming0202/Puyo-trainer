import { formatKeyCode, loadKeybinds, type GameplayAction } from './game/keybinds'

const GUIDE_ID = 'puyo-keyboard-guide'
const STYLE_ID = 'puyo-keyboard-guide-style'
const EVENT_NAME = 'puyo-keybinds-changed'

const ACTIONS: Array<[GameplayAction, string]> = [
  ['left', '左へ移動'],
  ['right', '右へ移動'],
  ['rotate-left', '左回転'],
  ['rotate-right', '右回転'],
  ['soft-drop', '落下'],
  ['hard-drop', 'ハードドロップ'],
  ['reset-turn', '現在のぷよを最初から'],
  ['undo', '一手戻す'],
  ['redo', 'やり直す'],
]

function keyText(action: GameplayAction): string {
  const [primary, secondary] = loadKeybinds()[action]
  if (secondary) return `${formatKeyCode(primary)} / ${formatKeyCode(secondary)}`
  return formatKeyCode(primary)
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${GUIDE_ID}{
      position:fixed;
      top:190px;
      right:18px;
      z-index:1000;
      width:172px;
      padding:12px;
      border:1px solid #293140;
      border-radius:12px;
      background:rgba(18,22,30,.94);
      box-shadow:0 14px 36px rgba(0,0,0,.24);
      color:#edf1f7;
      font-size:10px;
    }
    #${GUIDE_ID} .keyboard-guide-title{color:#7e899b;font-size:10px;font-weight:800;letter-spacing:.16em;margin-bottom:9px}
    #${GUIDE_ID} .keyboard-guide-list{display:flex;flex-direction:column;gap:5px}
    #${GUIDE_ID} .keyboard-guide-row{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:7px}
    #${GUIDE_ID} kbd{display:inline-block;min-width:38px;padding:3px 5px;border:1px solid #3b4658;border-radius:5px;background:#202735;color:#e7edf5;text-align:center;font-size:9px;font-weight:800;line-height:1.2;white-space:nowrap}
    #${GUIDE_ID} .keyboard-guide-label{color:#9aa5b6;line-height:1.25}
    #${GUIDE_ID} .keyboard-guide-divider{height:1px;margin:5px 0 2px;background:#252d3a}
    #${GUIDE_ID} .keyboard-guide-static{display:grid;grid-template-columns:auto 1fr;gap:5px 7px;align-items:center}
    #${GUIDE_ID} .keyboard-guide-static .keyboard-guide-label{font-size:9px}
    @media (max-width:1400px){#${GUIDE_ID}{display:none}}
  `
  document.head.appendChild(style)
}

function render(): void {
  ensureStyle()
  let guide = document.getElementById(GUIDE_ID)
  if (!guide) {
    guide = document.createElement('div')
    guide.id = GUIDE_ID
    document.body.appendChild(guide)
  }

  const rows = ACTIONS.map(([action, label]) => `<div class="keyboard-guide-row"><kbd>${keyText(action)}</kbd><span class="keyboard-guide-label">${label}</span></div>`).join('')
  guide.innerHTML = `<div class="keyboard-guide-title">KEY GUIDE</div><div class="keyboard-guide-list">${rows}<div class="keyboard-guide-divider"></div><div class="keyboard-guide-static"><kbd>Ctrl+1</kbd><span class="keyboard-guide-label">Player A</span><kbd>Ctrl+2</kbd><span class="keyboard-guide-label">Player B</span><kbd>F</kbd><span class="keyboard-guide-label">停止 / 再開</span><kbd>C</kbd><span class="keyboard-guide-label">編集モード</span><kbd>P</kbd><span class="keyboard-guide-label">タイムラインにピン</span></div></div>`
}

function install(): void {
  render()
  window.addEventListener(EVENT_NAME, render)
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true })
else install()
