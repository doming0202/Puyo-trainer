import { loadKeybinds, type GameplayAction } from './game/keybinds'

const OVERLAY_ID = 'puyo-pause-overlay'
const STYLE_ID = 'puyo-pause-overlay-style'
const RESUME_COUNTDOWN_MS = 650
const TIMELINE_SEEK_EVENT = 'puyo-timeline-seek-complete'
const TIMELINE_RESUME_REQUEST_EVENT = 'puyo-timeline-resume-request'
const TIMELINE_RESUME_CANCEL_EVENT = 'puyo-timeline-resume-cancel'
const SNAPSHOT_LOADED_EVENT = 'puyo-snapshot-loaded'
const RESUME_ACTIONS: GameplayAction[] = ['left', 'right', 'rotate-left', 'rotate-right', 'soft-drop', 'hard-drop']

let manuallyPaused = false
let timelineAwaitingInput = false
let countingDown = false
let syntheticResume = false
let resumeTimer: number | null = null
let pendingResumeEvent: { key: string; code: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean } | null = null

function isGameplayBlocked(): boolean {
  if (document.querySelector('.direct-editor-overlay, .keybind-modal-backdrop')) return true
  return Array.from(document.querySelectorAll('.mode')).some((node) => node.textContent?.trim().toLowerCase() === 'replay')
}

function isConfiguredGameplayKey(event: KeyboardEvent): boolean {
  if (event.repeat || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return false
  const target = event.target as HTMLElement | null
  if (target?.matches('input, textarea, select, [contenteditable="true"]')) return false

  const keybinds = loadKeybinds()
  return RESUME_ACTIONS.some((action) => {
    const slots = keybinds[action]
    return slots[0] === event.code || slots[1] === event.code
  })
}

function ensureOverlay(): HTMLElement {
  let overlay = document.getElementById(OVERLAY_ID)
  if (overlay) return overlay

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      #${OVERLAY_ID}{
        position:fixed;left:50%;top:50%;width:180px;height:110px;
        transform:translate(-50%,-50%);z-index:9999;
        display:grid;place-items:center;
        pointer-events:none;opacity:0;visibility:hidden;
        background:transparent;backdrop-filter:none;
        transition:opacity .14s ease,visibility .14s ease;
      }
      #${OVERLAY_ID}.visible{opacity:1;visibility:visible}
      #${OVERLAY_ID} .pause-message{
        min-width:4em;text-align:center;color:#f5f7fb;font-weight:950;
        font-size:clamp(42px,5vw,72px);line-height:1;letter-spacing:.04em;
        text-shadow:0 4px 20px rgba(0,0,0,.62);
        user-select:none;
      }
      #${OVERLAY_ID} .pause-message.countdown{font-variant-numeric:tabular-nums}
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

function startResumeCountdown(resumeEvent: typeof pendingResumeEvent = null): void {
  if (countingDown) return
  countingDown = true
  pendingResumeEvent = resumeEvent
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
      timelineAwaitingInput = false
      hideOverlay()

      syntheticResume = true
      document.documentElement.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'f',
        code: 'KeyF',
        bubbles: true,
        cancelable: true,
      }))
      syntheticResume = false

      const eventToResume = pendingResumeEvent
      pendingResumeEvent = null
      if (eventToResume) {
        window.setTimeout(() => {
          document.documentElement.dispatchEvent(new KeyboardEvent('keydown', {
            key: eventToResume.key,
            code: eventToResume.code,
            ctrlKey: eventToResume.ctrlKey,
            shiftKey: eventToResume.shiftKey,
            altKey: eventToResume.altKey,
            metaKey: eventToResume.metaKey,
            bubbles: true,
            cancelable: true,
          }))
        }, 0)
      }
    }, 220)
  }

  next()
}

function resetPauseState(): void {
  manuallyPaused = false
  timelineAwaitingInput = false
  pendingResumeEvent = null
  if (resumeTimer !== null) {
    window.clearTimeout(resumeTimer)
    resumeTimer = null
  }
  countingDown = false
  hideOverlay()
  window.dispatchEvent(new Event(TIMELINE_RESUME_CANCEL_EVENT))
}

function pauseAfterSnapshotLoad(): void {
  if (countingDown) return
  window.dispatchEvent(new Event(TIMELINE_RESUME_CANCEL_EVENT))
  manuallyPaused = false
  timelineAwaitingInput = true
  pendingResumeEvent = null
  setOverlay('Pause')
}

function install(): void {
  ensureOverlay()

  window.addEventListener(TIMELINE_SEEK_EVENT, () => {
    if (countingDown) return
    timelineAwaitingInput = true
    manuallyPaused = false
    pendingResumeEvent = null
    setOverlay('Pause')
  })

  window.addEventListener(SNAPSHOT_LOADED_EVENT, () => {
    pauseAfterSnapshotLoad()
  })

  window.addEventListener(TIMELINE_RESUME_REQUEST_EVENT, (event) => {
    if (!timelineAwaitingInput || countingDown || isGameplayBlocked()) return
    const detail = (event as CustomEvent<typeof pendingResumeEvent>).detail ?? null
    startResumeCountdown(detail)
  })

  window.addEventListener('keydown', (event) => {
    if (syntheticResume || event.repeat) return
    if (isGameplayBlocked()) return

    if (event.code === 'KeyF') {
      if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return

      event.preventDefault()
      event.stopImmediatePropagation()

      if (timelineAwaitingInput) {
        window.dispatchEvent(new Event(TIMELINE_RESUME_CANCEL_EVENT))
        timelineAwaitingInput = false
        startResumeCountdown()
        return
      }

      if (!manuallyPaused) {
        manuallyPaused = true
        setOverlay('Pause')
        syntheticResume = true
        document.documentElement.dispatchEvent(new KeyboardEvent('keydown', {
          key: event.key,
          code: 'KeyF',
          bubbles: true,
          cancelable: true,
        }))
        syntheticResume = false
        return
      }

      startResumeCountdown()
      return
    }

    if ((manuallyPaused || timelineAwaitingInput) && isConfiguredGameplayKey(event)) {
      event.preventDefault()
      event.stopImmediatePropagation()

      if (timelineAwaitingInput) {
        window.dispatchEvent(new Event(TIMELINE_RESUME_CANCEL_EVENT))
        timelineAwaitingInput = false
      }

      startResumeCountdown({
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      })
    }
  }, true)

  window.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    if (!target) return
    const button = target.closest('button')
    if (!button) return
    const text = button.textContent?.trim() ?? ''
    if (text.includes('新しいゲーム')) resetPauseState()
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true })
} else {
  install()
}
