import './keyboard-startup-buffer'
import './keyboard-focus-guard'
import './keyboard-guide'
import './room-access-policy'
import './title-reset.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { KeyboardReady } from './components/KeyboardReady'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <KeyboardReady />
    <App />
    <FallSpeedControl />
    <SnapshotBookmark />
    <PuyoSequenceDebugPanel />
  </StrictMode>,
)
