import './keyboard-startup-buffer'
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
    // The trainer is keyboard-first. Focus the app root before releasing the
    // startup keyboard buffer so the first gameplay key is not lost because
    // focus is still on the browser chrome or a previous page element.
    const root = document.getElementById('root')
    if (root) {
      root.setAttribute('tabindex', '-1')
      root.focus({ preventScroll: true })
    }
    window.focus()
    window.dispatchEvent(new Event('puyo-trainer-keyboard-ready'))
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
