import { useLayoutEffect } from 'react'

const READY_EVENT = 'puyo-trainer-keyboard-ready'

function focusRoot(): void {
  const root = document.getElementById('root')
  if (!root || !document.hasFocus()) return
  const active = document.activeElement
  if (active === document.body || active === document.documentElement || active === root) {
    root.focus({ preventScroll: true })
  }
}

export function KeyboardReady() {
  useLayoutEffect(() => {
    focusRoot()
    window.dispatchEvent(new Event(READY_EVENT))

    const frame = window.requestAnimationFrame(() => {
      focusRoot()
      window.dispatchEvent(new Event(READY_EVENT))
    })

    return () => window.cancelAnimationFrame(frame)
  }, [])

  return null
}
