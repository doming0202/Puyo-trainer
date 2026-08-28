import { loadKeybinds, type GameplayAction } from './game/keybinds'

const EVENT_NAME = 'puyo-timeline-seek-complete'
const RESUME_REQUEST_EVENT = 'puyo-timeline-resume-request'
const RESUME_ACTIONS: GameplayAction[] = ['left', 'right', 'rotate-left', 'rotate-right', 'soft-drop', 'hard-drop']

let installed = false
let awaitingInput = false

function getTimeline(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('.timeline[type="range"]')
}

function bindingFromEvent(event: KeyboardEvent): string {
  const modifiers: string[] = []
  if (event.ctrlKey) modifiers.push('Ctrl')
  if (event.shiftKey) modifiers.push('Shift')
  if (event.altKey) modifiers.push('Alt')
  if (event.metaKey) modifiers.push('Win')
  return [...modifiers, event.code].join('+')
}

function notifySeekComplete(): void {
  awaitingInput = true
  window.dispatchEvent(new Event(EVENT_NAME))
}

function isResumeKey(event: KeyboardEvent): boolean {
  if (event.repeat || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return false
  const binding = bindingFromEvent(event)
  const keybinds = loadKeybinds()
  return RESUME_ACTIONS.some((action) => {
    const slots = keybinds[action]
    return slots[0] === binding || slots[1] === binding
  })
}

function setup(): boolean {
  const timeline = getTimeline()
  if (!timeline) return false

  if (timeline.dataset.resumeReady !== 'true') {
    timeline.dataset.resumeReady = 'true'
    // The change event is emitted both by normal slider interaction and by
    // the timeline-controls jump/pin implementation.
    timeline.addEventListener('change', notifySeekComplete)
  }

  return true
}

function install(): void {
  if (installed || setup()) {
    installed = true
    return
  }

  const observer = new MutationObserver(() => {
    if (setup()) {
      installed = true
      observer.disconnect()
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

window.addEventListener('keydown', (event) => {
  if (!awaitingInput || !isResumeKey(event)) return
  const target = event.target as HTMLElement | null
  if (target?.matches('input, textarea, select, button') && !target.matches('.timeline')) return

  event.preventDefault()
  event.stopImmediatePropagation()
  awaitingInput = false

  window.dispatchEvent(new CustomEvent(RESUME_REQUEST_EVENT, {
    detail: {
      key: event.key,
      code: event.code,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    },
  }))
}, true)

window.addEventListener('puyo-timeline-resume-cancel', () => {
  awaitingInput = false
})

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true })
} else {
  window.requestAnimationFrame(install)
}
