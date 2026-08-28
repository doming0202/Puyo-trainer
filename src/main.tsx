import { useState } from 'react'
import './keyboard-startup-buffer'
import './keyboard-guide'
import './title-reset.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { PaletteStartModal } from './components/PaletteStartModal'
import './volume-control'
import './pause-overlay'
import './timeline-controls'
import './timeline-resume'
import './timeline-branch'

const STARTED_KEY = 'puyo-trainer-started-v1'

function Startup() {
  const [started] = useState(() => {
    try {
      return window.sessionStorage.getItem(STARTED_KEY) === '1'
    } catch {
      return false
    }
  })

  if (started) return <App />

  return <PaletteStartModal onStart={() => {
    try {
      window.sessionStorage.setItem(STARTED_KEY, '1')
    } catch {
      // Continue even if sessionStorage is unavailable.
    }
    window.location.reload()
  }} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Startup />
  </StrictMode>,
)
