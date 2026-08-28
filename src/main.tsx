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

function Startup() {
  const [started, setStarted] = useState(false)

  return <>
    <App startupPaused={!started} />
    {!started && <PaletteStartModal onStart={() => setStarted(true)} />}
  </>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Startup />
  </StrictMode>,
)
