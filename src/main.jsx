import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Legacy from './legacy/Legacy.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Legacy />
  </StrictMode>,
)
