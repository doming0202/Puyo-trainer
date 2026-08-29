import { useEffect } from 'react'

const READY_EVENT = 'puyo-trainer-keyboard-ready'

export function KeyboardReady() {
  useEffect(() => {
    const root = document.getElementById('root')
    if (root && document.activeElement === document.body) {
      root.focus({ preventScroll: true })
    }
    window.dispatchEvent(new Event(READY_EVENT))
  }, [])

  return null
}
