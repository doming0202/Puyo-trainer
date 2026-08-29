const READY_EVENT = 'puyo-trainer-keyboard-ready'
const STARTUP_TIMEOUT_MS = 1800

let startupActive = true
let fallbackTimer: number | null = null
const bufferedEvents: Array<{
  key: string
  code: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
}> = []

function isModifierOnly(event: KeyboardEvent): boolean {
  return ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)
}

function shouldBuffer(event: KeyboardEvent): boolean {
  if (!startupActive || event.repeat || isModifierOnly(event)) return false
  const target = event.target as HTMLElement | null
  if (target?.matches('input, textarea, select, [contenteditable="true"]')) return false
  return true
}

function queue(event: KeyboardEvent): void {
  bufferedEvents.push({
    key: event.key,
    code: event.code,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
  })
}

function flush(): void {
  if (!startupActive) return
  startupActive = false
  if (fallbackTimer !== null) {
    window.clearTimeout(fallbackTimer)
    fallbackTimer = null
  }

  const events = bufferedEvents.splice(0)
  for (const detail of events) {
    window.dispatchEvent(new KeyboardEvent('keydown', {
      ...detail,
      bubbles: true,
      cancelable: true,
    }))
  }
}

window.addEventListener('keydown', (event) => {
  if (!shouldBuffer(event)) return
  queue(event)
  event.preventDefault()
  event.stopImmediatePropagation()
}, true)

window.addEventListener(READY_EVENT, flush, { once: true })
fallbackTimer = window.setTimeout(flush, STARTUP_TIMEOUT_MS)
