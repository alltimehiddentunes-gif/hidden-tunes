import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppErrorBoundary } from '../components/AppErrorBoundary'
import App from '../App'
import '../index.css'
import './tv.css'
import './tokens.css'
import './ui/foundation.css'
import './ui/home.css'
import { installTvArtworkCompatibility } from './artwork'
import { detectTvCapabilities } from './capabilities'
import { installTvRemoteControls } from './remote'
import { tvPathForRoute, tvRouteFromPath } from './routes'

const capabilities = detectTvCapabilities()
document.documentElement.dataset.lowMemory = String(capabilities.lowMemory)
document.documentElement.dataset.tvPlatform = capabilities.platform
const initialRoute = tvRouteFromPath(location.pathname)
window.__HT_WEB_NAVIGATION_BOOTSTRAP__ = { enabled: true, initialRoute }

if (location.pathname === '/activate') {
  const notice = document.createElement('aside')
  notice.className = 'tv-activation-notice'
  notice.setAttribute('role', 'status')
  notice.textContent = 'TV activation is not available yet. Use the secure browser sign-in option in Settings.'
  document.body.appendChild(notice)
}

const uninstallRemote = installTvRemoteControls()
const uninstallArtwork = installTvArtworkCompatibility()
addEventListener('beforeunload', () => { uninstallRemote(); uninstallArtwork() }, { once: true })

const connectHistory = () => {
  const navigation = window.HiddenTunesNavigation
  if (!navigation) return false
  let initialPublication = true
  navigation.subscribe((route) => {
    if (initialPublication) {
      initialPublication = false
      return
    }
    const path = tvPathForRoute(route)
    if (path && path !== location.pathname) history.pushState({ hiddenTunesTv: true }, '', path)
  })
  addEventListener('popstate', () => navigation.navigate(tvRouteFromPath(location.pathname)))
  return true
}
if (!connectHistory()) addEventListener('hidden-tunes-navigation-ready', connectHistory, { once: true })

const root = document.getElementById('root')
if (!root) throw new Error('Hidden Tunes TV root container is missing.')
createRoot(root).render(<StrictMode><AppErrorBoundary><App /></AppErrorBoundary></StrictMode>)
