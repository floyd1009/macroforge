import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

/**
 * iOS standalone-PWA viewport guard.
 *
 * In a home-screen web app, the first time the software keyboard opens the
 * visual viewport can stay shrunk after it closes, leaving a dead band at the
 * bottom of the screen until the app is force-quit. Pinning a CSS variable to
 * the *layout* viewport height and restoring scroll on blur avoids it — and
 * this app's primary voice path is dictation into a textarea, so the keyboard
 * opens constantly.
 */
function installViewportGuard() {
  const setHeight = () => {
    document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
  }
  setHeight()
  window.addEventListener('resize', setHeight)
  window.addEventListener('orientationchange', () => setTimeout(setHeight, 120))

  document.addEventListener(
    'focusout',
    () => {
      // Give the keyboard time to retract, then force the page back to the top.
      setTimeout(() => {
        window.scrollTo(0, 0)
        setHeight()
      }, 60)
    },
    true,
  )
}

installViewportGuard()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
