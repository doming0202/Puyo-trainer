import { useEffect, useState } from 'react'
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

function sendPauseKey(): void {
  document.body.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'f',
    code: 'KeyF',
    bubbles: true,
  }))
}

function Startup() {
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => sendPauseKey(), 50)
    return () => window.clearTimeout(timer)
  }, [])

  const start = () => {
    sendPauseKey()
    setStarted(true)
  }

  return <>
    <App />
    {!started && <PaletteStartModal onStart={start} />}
  </>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Startup />
  </StrictMode>,
)
