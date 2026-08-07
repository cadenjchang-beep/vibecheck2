import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
// The display face, used with restraint — see index.css's --font-display.
// Optical sizing lets the same file read right from a small chip up to a
// large headline, so one (non-italic — nothing in Tend sets italic) import
// covers every place it's used.
import '@fontsource-variable/literata/opsz.css'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline support. Registration failure is not fatal — Tend already works from
// localStorage; the worker only makes the shell load without a network.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
