const OVERLAY_ID = 'puyo-pause-overlay'
const STYLE_ID = 'puyo-pause-overlay-style'
const RESUME_COUNTDOWN_MS = 650

let manuallyPaused = false
let countingDown = false
let syntheticResume = false
let resumeTimer: number | null = null

function isGameplayBlocked(): boolean {
  if (document.querySelector('.direct-editor-overlay, .keybind-modal-backdrop')) return true
  return Array.from(document.querySelectorAll('.mode')).some((node) => node.textContent?.trim().toLowerCase() === 'replay')
}

function ensureOverlay(): HTMLElement {
  let overlay = document.getElementById(OVERLAY_ID)
  if (overlay) return overlay

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      #${OVERLAY_ID}{
        position:fixed;inset:0;z-index:9999;display:grid;place-items:center;
        pointer-events:none;opacity:0;visibility:hidden;
        background:rgba(4,7,12,.44);backdrop-filter:blur(2px);
        transition:opacity .14s ease,visibility .14s ease;
      }
      #${OVERLAY_ID}.visible{opacity:1;visibility:visible}
      #${OVERLAY_ID} .pause-message{
        min-width:4em;text-align:center;color:#f5f7fb;font-weight:950;
        font-size:clamp(64px,11vw,132px);line-height:1;letter-spacing:.08em;
        text-shadow:0 5px 28px rgba(0,0,0,.65),0 0 18px rgba(143,215,255,.18);
        user-select:none;
      }
      #${OVERLAY_ID} .pause-message.countdown{font-variant-numeric:tabular-nums}

      /* Direct editing uses the side margin for Pause so the board/editor
         remains unobstructed. Exiting edit mode automatically restores the
         full-screen centered presentation above. */
      body:has(.direct-editor-overlay) #${OVERLAY_ID}{
        inset:auto 18px auto auto;
        top:50%;
        width:clamp(150px,16vw,220px);
        height:110px;
        transform:translateY(-50%);
        background:transparent;
        backdrop-filter:none;
      }
      body:has(.direct-editor-overlay) #${OVERLAY_ID} .pause-message{
        min-width:0;
        font-size:clamp(42px,5vw,72px);
        letter-spacing:.04em;
        text-shadow:0 4px 20px rgba(0,0,0,.62);
      }
    `
    document.head.appendChild(style)
  }

  overlay = document.createElement('div')
  overlay.id = OVERLAY_ID
  overlay.setAttribute('aria-live', 'assertive')
  overlay.setAttribute('aria-label', 'ゲーム一時停止')
  overlay.innerHTML = '<div class="pause-message">Pause</div>'
  document.body.appendChild(overlay)
  return overlay
}

function setOverlay(message: string, countdown = false): void {
  const overlay = ensureOverlay()
  const messageNode = overlay.querySelector<HTMLElement>('.pause-message')!
  messageNode.textContent = message
  messageNode.classList.toggle('countdown', countdown)
  overlay.classList.add('visible')
}

function hideOverlay(): void {
  const overlay = document.getElementById(OVERLAY_ID)
  overlay?.classList.remove('visible')
}

function startResumeCountdown(): void {
  if (countingDown) return
  countingDown = true
  let count = 3

  const next = () => {
    if (!countingDown) return

    if (count > 0) {
      setOverlay(String(count), true)
      count -= 1
      resumeTimer = window.setTimeout(next, RESUME_COUNTDOWN_MS)
      return
    }

    setOverlay('GO!', true)
    resumeTimer = window.setTimeout(() => {
      resumeTimer = null
      countingDown = false
      manuallyPaused = false
      hideOverlay()

      syntheticResume = true
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'f',
        code: 'KeyF',
        bubbles: true,
        cancelable: true,
      }))
      syntheticResume = false
    }, 220)
  }

  next()
}

function resetPauseState(): void {
  manuallyPaused = false
  if (resumeTimer !== null) {
    window.clearTimeout(resumeTimer)
    resumeTimer = null
  }
  countingDown = false
  hideOverlay()
}

function install(): void {
  ensureOverlay()

  window.addEventListener('keydown', (event) => {
    if (syntheticResume || event.code !== 'KeyF' || event.repeat) return
    if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return
    if (isGameplayBlocked()) return

    event.preventDefault()
    event.stopImmediatePropagation()

    if (!manuallyPaused) {
      manuallyPaused = true
      setOverlay('Pause')
      // Re-dispatch the original event after the capture handler so App.tsx
      // performs its existing running=true/false toggle exactly once.
      syntheticResume = true
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: event.key,
        code: event.code,
        bubbles: true,
        cancelable: true,
      }))
      syntheticResume = false
      return
    }

    startResumeCountdown()
  }, true)

  window.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    if (!target) return
    const button = target.closest('button')
    if (!button) return
    const text = button.textContent?.trim() ?? ''
    if (text.includes('新しいゲーム') || text.includes('読み込む')) resetPauseState()
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true })
} else {
  install()
}
