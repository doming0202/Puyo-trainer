const ROOT_ID = 'root'
const STARTUP_TIMEOUT_MS = 1800
const FLUSH_DELAY_MS = 60

let startupActive = true
let flushTimer: number | null = null
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
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer)
    flushTimer = null
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

function scheduleFlush(): void {
  if (!startupActive || flushTimer !== null) return
  flushTimer = window.setTimeout(flush, FLUSH_DELAY_MS)
}

window.addEventListener('keydown', (event) => {
  if (!shouldBuffer(event)) return
  queue(event)
  event.preventDefault()
  event.stopImmediatePropagation()
}, true)

const root = document.getElementById(ROOT_ID)
if (root) {
  const observer = new MutationObserver(() => {
    if (root.childElementCount > 0) {
      scheduleFlush()
      observer.disconnect()
    }
  })
  observer.observe(root, { childList: true })
  if (root.childElementCount > 0) scheduleFlush()
}

window.setTimeout(() => flush(), STARTUP_TIMEOUT_MS)
