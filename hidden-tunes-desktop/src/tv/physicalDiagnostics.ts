type RectState = { x: number; y: number; width: number; height: number; top: number; right: number; bottom: number; left: number } | null

function rect(selector: string): RectState {
  const node = document.querySelector<HTMLElement>(selector)
  if (!node) return null
  const value = node.getBoundingClientRect()
  return { x: value.x, y: value.y, width: value.width, height: value.height, top: value.top, right: value.right, bottom: value.bottom, left: value.left }
}

function focusId(node: Element | null) {
  if (!(node instanceof HTMLElement)) return 'none'
  return node.dataset.tvFocusId || node.id || node.getAttribute('aria-label') || node.tagName.toLowerCase()
}

function geometryState() {
  const scroller = document.querySelector<HTMLElement>('.main-scroll--home')
  const media = document.querySelector<HTMLMediaElement>('audio,video')
  const activeArtwork = document.querySelector<HTMLElement>('.player-bar [data-tv-media-id],.conditional-player-rail [data-tv-media-id]')
  const side = document.querySelector<HTMLElement>('.conditional-player-rail')
  return {
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    activeElementId: focusId(document.activeElement),
    internalFocusedId: document.activeElement instanceof HTMLElement ? document.activeElement.dataset.tvFocusId || 'none' : 'none',
    homeScroller: scroller ? {
      rect: rect('.main-scroll--home'), scrollTop: scroller.scrollTop, clientHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight, clientWidth: scroller.clientWidth, scrollWidth: scroller.scrollWidth,
      verticalOverflow: Math.max(0, scroller.scrollHeight - scroller.clientHeight),
      horizontalOverflow: Math.max(0, scroller.scrollWidth - scroller.clientWidth),
    } : null,
    playback: media ? { paused: media.paused, ended: media.ended, readyState: media.readyState, currentTime: media.currentTime } : null,
    activeMediaId: activeArtwork?.dataset.tvMediaId || 'none',
    sidePlayer: { visible: Boolean(side && getComputedStyle(side).display !== 'none' && side.getAttribute('aria-hidden') !== 'true'), rect: rect('.conditional-player-rail') },
    heroRect: rect('.music-home-reference-top'),
    miniPlayerRect: rect('.player-bar'),
    documentOverflow: {
      bodyX: Math.max(0, document.body.scrollWidth - innerWidth), bodyY: Math.max(0, document.body.scrollHeight - innerHeight),
      rootX: Math.max(0, document.documentElement.scrollWidth - innerWidth), rootY: Math.max(0, document.documentElement.scrollHeight - innerHeight),
    },
  }
}

export function installPhysicalTvDiagnosticBridge() {
  if (new URLSearchParams(location.search).get('tvbridge') !== '1') return () => {}
  const random = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const sessionId = `vidaa-${random}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
  let sequence = 0
  let lastSend = 0
  let lastSnapshotToken = 0
  let stopped = false

  const send = (type: string, detail: Record<string, unknown> = {}, force = false) => {
    const now = performance.now()
    if (!force && now - lastSend < 100) return
    lastSend = now
    const payload = { sessionId, sequence: ++sequence, type, timestamp: Date.now(), performanceNow: now, ...detail, state: geometryState() }
    fetch('/__tv_diag/event', { method: 'POST', cache: 'no-store', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {})
  }

  const onKey = (event: KeyboardEvent) => {
    const before = document.activeElement
    requestAnimationFrame(() => send('remote-key', {
      eventType: event.type, key: event.key, code: event.code, keyCode: event.keyCode, which: event.which, repeat: event.repeat,
      activeBefore: focusId(before), activeAfter: focusId(document.activeElement),
    }, true))
  }
  const onFocus = (event: FocusEvent) => send('native-focus-change', {
    focusedId: focusId(event.target instanceof Element ? event.target : null),
    previousId: focusId(event.relatedTarget instanceof Element ? event.relatedTarget : null),
  }, true)
  const onDecision = (event: Event) => send('focus-decision', (event as CustomEvent<Record<string, unknown>>).detail || {}, true)
  const onError = (event: ErrorEvent) => send('javascript-exception', { message: event.message, filename: event.filename?.split('/').pop(), line: event.lineno, column: event.colno }, true)
  const onRejection = (event: PromiseRejectionEvent) => send('unhandled-rejection', { message: event.reason instanceof Error ? event.reason.message : String(event.reason || 'unknown') }, true)

  addEventListener('keydown', onKey, true)
  addEventListener('keyup', onKey, true)
  addEventListener('keypress', onKey, true)
  addEventListener('focusin', onFocus, true)
  addEventListener('ht-tv-focus-decision', onDecision)
  addEventListener('error', onError)
  addEventListener('unhandledrejection', onRejection)

  const heartbeat = window.setInterval(() => send('state-heartbeat', {}, true), 2000)
  const control = window.setInterval(() => {
    fetch('/__tv_diag/control', { cache: 'no-store', credentials: 'omit' }).then((response) => response.json()).then((value: { snapshotRequestToken?: number }) => {
      const token = Number(value.snapshotRequestToken || 0)
      if (token > lastSnapshotToken) { lastSnapshotToken = token; send('requested-snapshot', { snapshotToken: token }, true) }
    }).catch(() => {})
  }, 750)
  send('session-start', { navigationTiming: performance.getEntriesByType('navigation')[0]?.toJSON?.() || null }, true)

  return () => {
    if (stopped) return
    stopped = true
    clearInterval(heartbeat); clearInterval(control)
    removeEventListener('keydown', onKey, true); removeEventListener('keyup', onKey, true); removeEventListener('keypress', onKey, true)
    removeEventListener('focusin', onFocus, true)
    removeEventListener('ht-tv-focus-decision', onDecision)
    removeEventListener('error', onError); removeEventListener('unhandledrejection', onRejection)
  }
}
