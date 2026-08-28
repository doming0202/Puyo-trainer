import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './volume-control'
import './timeline-controls'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
