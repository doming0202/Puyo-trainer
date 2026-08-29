import './keyboard-startup-buffer'
import './keyboard-guide'
import './title-reset.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { FallSpeedControl } from './components/FallSpeedControl'
import { SnapshotBookmark } from './components/SnapshotBookmark'
import './volume-control'
import './pause-overlay'
import './timeline-controls'
import './timeline-resume'
import './timeline-branch'
import './fall-speed.css'
import './garbage.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <FallSpeedControl />
    <SnapshotBookmark />
  </StrictMode>,
)
