const KEY_ALIASES: Record<number, string> = {
  8: 'Back', 13: 'Enter', 27: 'Back', 33: 'PageUp', 34: 'PageDown', 37: 'ArrowLeft', 38: 'ArrowUp',
  39: 'ArrowRight', 40: 'ArrowDown', 10009: 'Back', 461: 'Back',
  415: 'MediaPlay', 19: 'MediaPause', 413: 'MediaStop', 417: 'MediaFastForward',
  412: 'MediaRewind', 176: 'MediaTrackNext', 177: 'MediaTrackPrevious',
}

let viewportOffsetY = 0
let queueOffsetY = 0
const routeOffsets = new Map<string, number>()

export function normalizeRemoteKey(event: KeyboardEvent) {
  return KEY_ALIASES[event.keyCode] ?? event.key
}

function focusables() {
  return Array.from(document.querySelectorAll<HTMLElement>(
    'button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])',
  )).filter((node) => node.offsetParent !== null && node.getAttribute('aria-hidden') !== 'true')
}

function translateFocused(node: HTMLElement, keyCode: number, pageStep = 0) {
  const queue = node.closest<HTMLElement>('.queue-list-scroll,.up-next-list,.ht-player-queue-section')
  const viewport = queue || document.querySelector<HTMLElement>('.main-scroll')
  const content = queue ? queue.firstElementChild as HTMLElement | null : viewport?.querySelector<HTMLElement>('.page-view')
  if (!viewport || !content) return
  const bounds = viewport.getBoundingClientRect(); const item = node.getBoundingClientRect()
  const before = queue ? queueOffsetY : viewportOffsetY
  let next = before + pageStep
  if (!pageStep && item.bottom > bounds.bottom - 48) next -= item.bottom - bounds.bottom + Math.round(bounds.height * .18)
  if (!pageStep && item.top < bounds.top + 48) next += bounds.top - item.top + Math.round(bounds.height * .18)
  const height = Math.max(content.scrollHeight, content.getBoundingClientRect().height)
  next = Math.max(Math.min(0, bounds.height - height - 48), Math.min(0, next))
  content.style.setProperty(queue ? '--tv-queue-offset-y' : '--tv-offset-y', `${next}px`)
  content.classList.add(queue ? 'tv-queue-translated' : 'tv-route-translated')
  if (queue) queueOffsetY = next
  else { viewportOffsetY = next; routeOffsets.set(location.pathname, next) }
  let overlay = document.getElementById('tv-remote-diagnostic')
  if (!overlay) { overlay = document.createElement('aside'); overlay.id = 'tv-remote-diagnostic'; overlay.tabIndex = -1; overlay.setAttribute('aria-hidden', 'true'); document.body.appendChild(overlay) }
  const selected = (node.getAttribute('aria-label') || node.textContent || 'none').trim().slice(0, 32)
  overlay.textContent = `key=${keyCode} focus=${selected} owner=${queue ? 'queue' : 'route'} offset=${Math.round(before)}->${Math.round(next)} height=${Math.round(height)}`
  const query = new URLSearchParams({ event: 'remote-move', keyCode: String(keyCode), selected, owner: queue ? 'queue' : 'route', before: String(Math.round(before)), after: String(Math.round(next)), height: String(Math.round(height)) })
  fetch(`/__tv_diag?${query}`, { method: 'GET', cache: 'no-store', credentials: 'omit' }).catch(() => {})
}
function requestNextPage(node: HTMLElement) {
  const container = node.closest<HTMLElement>('main,section,[class*="page"]')
  const visible = container ? Array.from(container.querySelectorAll<HTMLElement>('button:not([disabled])')).filter((item) => item.offsetParent !== null) : []
  if (visible.indexOf(node) < visible.length - 3) return
  visible.find((button) => /^(show|load|view) more/i.test((button.textContent || '').trim()))?.click()
}

function enhanceTvDom() {
  document.querySelectorAll<HTMLElement>('.queue-item,.player-queue-row,.up-next-item').forEach((node) => {
    if (!node.hasAttribute('tabindex')) node.tabIndex = 0
  })
  document.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    image.loading = 'lazy'
    image.decoding = 'async'
    if (!image.hasAttribute('width')) image.width = 320
    if (!image.hasAttribute('height')) image.height = 320
  })
}

function moveFocus(key: string, keyCode: number) {
  const nodes = focusables()
  if (!nodes.length) return
  const active = document.activeElement as HTMLElement | null
  const from = active?.getBoundingClientRect()
  if (!from) return void nodes[0]?.focus()
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight'
  const positive = key === 'ArrowRight' || key === 'ArrowDown'
  const candidates = nodes.filter((node) => node !== active).map((node) => {
    const rect = node.getBoundingClientRect()
    const primary = horizontal ? rect.left - from.left : rect.top - from.top
    const secondary = horizontal ? Math.abs(rect.top - from.top) : Math.abs(rect.left - from.left)
    return { node, primary, score: Math.abs(primary) + secondary * 2 }
  }).filter(({ primary }) => positive ? primary > 4 : primary < -4).sort((a, b) => a.score - b.score)
  const target = candidates[0]?.node
  if (target) {
    target.focus()
    translateFocused(target, keyCode)
    requestNextPage(target)
  } else {
    if (active) translateFocused(active, keyCode, Math.round(innerHeight * .6) * (positive ? -1 : 1))
  }
}

function hasClosableLayer() {
  return Boolean(document.querySelector(
    '[role="dialog"],.premium-player-overlay,.player-mode-switcher-menu,[aria-modal="true"]',
  ))
}

export function installTvRemoteControls() {
  const onKey = (event: KeyboardEvent) => {
    const key = normalizeRemoteKey(event)
    if (key.startsWith('Arrow')) {
      moveFocus(key, event.keyCode)
      event.preventDefault()
      return
    }
    if (key === 'Back') {
      if (document.fullscreenElement) void document.exitFullscreen()
      else if (hasClosableLayer()) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      else if (history.length > 1) history.back()
      event.preventDefault()
      return
    }
    const media = document.querySelector<HTMLMediaElement>('video, audio')
    if (!media) return
    if (key === 'MediaPlay' || key === 'MediaPause' || key === 'MediaPlayPause') {
      if (media.paused) void media.play(); else media.pause()
    } else if (key === 'MediaStop') {
      media.pause(); media.currentTime = 0
    } else if (key === 'MediaFastForward' && Number.isFinite(media.duration)) {
      media.currentTime = Math.min(media.duration, media.currentTime + 10)
    } else if (key === 'MediaRewind') {
      media.currentTime = Math.max(0, media.currentTime - 10)
    } else return
    event.preventDefault()
  }
  addEventListener('keydown', onKey, true)
  const restoreOffset = () => { viewportOffsetY = routeOffsets.get(location.pathname) || 0; const content = document.querySelector<HTMLElement>('.main-scroll .page-view'); if (content) { content.style.setProperty('--tv-offset-y', String(viewportOffsetY) + 'px'); content.classList.add('tv-route-translated') } }
  addEventListener('popstate', restoreOffset)
  const focusFirst = () => {
    if (document.activeElement === document.body || !document.activeElement) focusables()[0]?.focus()
  }
  requestAnimationFrame(() => { enhanceTvDom(); focusFirst() })
  const observer = new MutationObserver(() => { enhanceTvDom(); focusFirst() })
  observer.observe(document.body, { childList: true, subtree: true })
  return () => { removeEventListener('keydown', onKey, true); removeEventListener('popstate', restoreOffset); observer.disconnect() }
}
