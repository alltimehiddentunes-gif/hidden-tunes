const SESSION_ID = new URLSearchParams(location.search).get('v') || `tv-${Date.now()}`

function assetName() {
  const source = Array.from(document.scripts).map((script) => script.src).find((src) => /\/assets\/tv-[^/]+\.js$/.test(src))
  return source?.split('/').pop() || 'pending'
}

function send(event: string, detail = '') {
  const query = new URLSearchParams({ event, kind: 'session', selected: location.pathname, owner: SESSION_ID, before: String(Math.round(performance.now())), after: detail, width: String(innerWidth), height: String(innerHeight), asset: assetName() })
  fetch(`/__tv_diag?${query}`, { method: 'GET', cache: 'no-store', credentials: 'omit' }).catch(() => {})
}

export function installTvSessionDiagnostics() {
  let overlay = document.getElementById('tv-session-diagnostic')
  if (!overlay) { overlay = document.createElement('aside'); overlay.id = 'tv-session-diagnostic'; overlay.tabIndex = -1; overlay.setAttribute('aria-hidden', 'true'); document.body.appendChild(overlay) }
  overlay.textContent = `${assetName()} | session ${SESSION_ID} | ${innerWidth}x${innerHeight}`
  send('session-start')
  const onError = (event: ErrorEvent) => send('window-error', (event.message || 'unknown').slice(0, 40))
  const onRejection = () => send('promise-rejection')
  const onPop = () => send('route-pop')
  addEventListener('error', onError); addEventListener('unhandledrejection', onRejection); addEventListener('popstate', onPop)
  const heartbeat = window.setInterval(() => send('session-heartbeat'), 30000)
  return () => { clearInterval(heartbeat); removeEventListener('error', onError); removeEventListener('unhandledrejection', onRejection); removeEventListener('popstate', onPop) }
}