const STYLE_ID = 'puyo-turn-copy-controls-style'
const CONTROLS_ID = 'puyo-turn-copy-controls'
const ORIGINAL_BUTTON_SELECTOR = '.vs .board-edit-button'

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${CONTROLS_ID}{display:flex;flex-direction:column;align-items:stretch;gap:7px;width:100%;}
    #${CONTROLS_ID} button{min-width:132px;padding:10px 14px;font-size:11px;font-weight:800;color:#edf1f7;background:#202735;border:1px solid #58667c;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.2);}
    #${CONTROLS_ID} button:hover:not(:disabled){background:#2b3545;border-color:#71809a;}
    #${CONTROLS_ID} button:disabled{opacity:.45;cursor:default;}
    .vs .turn-copy-focus{display:none !important;}
    .vs .turn-copy-original{display:none !important;}
  `
  document.head.appendChild(style)
}

function createButton(label: string, sourceIndex: 0 | 1): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.addEventListener('click', () => {
    const cards = document.querySelectorAll<HTMLElement>('.player-card')
    const original = document.querySelector<HTMLButtonElement>('.turn-copy-original')
    const sourceCard = cards[sourceIndex]
    if (!sourceCard || !original || original.disabled) return

    // The existing React copy operation uses the focused player as its target.
    // Focus the requested source player, then invoke the existing operation.
    sourceCard.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    window.setTimeout(() => {
      const currentOriginal = document.querySelector<HTMLButtonElement>('.turn-copy-original')
      if (currentOriginal && !currentOriginal.disabled) currentOriginal.click()
    }, 0)
  })
  return button
}

function install(): void {
  ensureStyles()

  const installControls = () => {
    const original = Array.from(document.querySelectorAll<HTMLButtonElement>(ORIGINAL_BUTTON_SELECTOR))
      .find((button) => button.textContent?.trim() === '相手の画面を再現')
    if (!original || original.parentElement?.querySelector(`#${CONTROLS_ID}`)) return

    original.classList.add('turn-copy-original')
    const controls = document.createElement('div')
    controls.id = CONTROLS_ID
    controls.appendChild(createButton('A→Bをコピー', 0))
    controls.appendChild(createButton('B→Aをコピー', 1))
    original.parentElement?.insertBefore(controls, original)

    const syncDisabled = () => {
      const buttons = controls.querySelectorAll<HTMLButtonElement>('button')
      buttons[0].disabled = original.disabled
      buttons[1].disabled = original.disabled
    }
    syncDisabled()

    const observer = new MutationObserver(syncDisabled)
    observer.observe(original, { attributes: true, attributeFilter: ['disabled'] })
  }

  const observer = new MutationObserver(installControls)
  observer.observe(document.body, { childList: true, subtree: true })
  installControls()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true })
} else {
  install()
}
