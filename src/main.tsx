import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Register the service worker manually so that failures are caught and
// downgraded to a console warning — the app continues to function in
// online mode (Requirement 10.5).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err: unknown) => {
        console.warn('[DietSync] Service worker registration failed. The app will run in online-only mode.', err)
      })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
