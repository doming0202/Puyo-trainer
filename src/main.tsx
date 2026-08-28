import './keyboard-startup-buffer'
import './keyboard-guide'
import './title-reset.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './volume-control'
import './pause-overlay'
import './turn-copy-controls'
import './timeline-controls'
import './timeline-resume'
import './timeline-branch'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
