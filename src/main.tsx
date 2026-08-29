import './keyboard-guide'
import './title-reset.css'
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { FallSpeedControl } from './components/FallSpeedControl'
import { SnapshotBookmark } from './components/SnapshotBookmark'
import { PuyoSequenceDebugPanel } from './components/PuyoSequenceDebugPanel'
import './volume-control'
import './pause-overlay'
import './timeline-controls'
import './timeline-resume'
import './timeline-branch'
import './fall-speed.css'
import './garbage.css'
import './header-library-hide.css'

function KeyboardReady() {
  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return

    root.setAttribute('tabindex', '-1')

    const focusApp = () => {
      // Do not steal focus from an actual form control. When the browser has
      // just restored focus to the page, reclaim it so gameplay keys work on
      // the very first press after startup/resume.
      const active = document.activeElement as HTMLElement | null
      if (active?.matches('input, textarea, select, [contenteditable="true"]')) return
      root.focus({ preventScroll: true })
    }

    // Firefox can keep focus on the browser chrome during a hard reload. A
    // single focus() is therefore not sufficient; retry briefly while the
    // document becomes active. This does not affect gameplay once focused.
    focusApp()
    const timers = [50, 150, 350, 700].map((delay) => window.setTimeout(focusApp, delay))
    const onWindowFocus = () => window.setTimeout(focusApp, 0)
    const onVisibility = () => { if (document.visibilityState === 'visible') window.setTimeout(focusApp, 0) }
    const onPointerDown = () => window.setTimeout(focusApp, 0)

    window.addEventListener('focus', onWindowFocus)
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('pointerdown', onPointerDown, true)

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      window.removeEventListener('focus', onWindowFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [])

  return null
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <FallSpeedControl />
    <SnapshotBookmark />
    <PuyoSequenceDebugPanel />
    <KeyboardReady />
  </StrictMode>,
)
