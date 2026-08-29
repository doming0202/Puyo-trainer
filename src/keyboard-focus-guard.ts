const ROOT_ID = 'root'

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable="true"]')
}

function focusAppRoot(): void {
  if (!document.hasFocus()) return
  const root = document.getElementById(ROOT_ID)
  if (!root) return

  const active = document.activeElement
  if (active && active !== document.body && active !== document.documentElement && active !== root) return
  root.focus({ preventScroll: true })
}

function scheduleFocusRecovery(): void {
  window.requestAnimationFrame(() => {
    focusAppRoot()
  })
}

window.addEventListener('focus', scheduleFocusRecovery)
window.addEventListener('pageshow', scheduleFocusRecovery)

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') scheduleFocusRecovery()
})

document.addEventListener('pointerdown', (event) => {
  if (isEditableTarget(event.target)) return
  const root = document.getElementById(ROOT_ID)
  if (!root || !(event.target instanceof Node) || !root.contains(event.target)) return
  scheduleFocusRecovery()
}, true)

window.addEventListener('keydown', (event) => {
  // Synthetic KeyboardEvents are used by the pause/timeline resume flow.
  // They must still reach the normal App key handler even when the browser
  // focus is temporarily outside the page.
  if (!event.isTrusted) return
  if (!document.hasFocus()) {
    event.stopImmediatePropagation()
  }
}, true)
