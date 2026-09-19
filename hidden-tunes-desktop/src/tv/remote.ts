const KEY_ALIASES: Record<number, string> = {
  8: 'Back', 13: 'Enter', 27: 'Back', 33: 'PageUp', 34: 'PageDown', 37: 'ArrowLeft', 38: 'ArrowUp',
  39: 'ArrowRight', 40: 'ArrowDown', 10009: 'Back', 461: 'Back',
  415: 'MediaPlay', 19: 'MediaPause', 413: 'MediaStop', 417: 'MediaFastForward',
  412: 'MediaRewind', 176: 'MediaTrackNext', 177: 'MediaTrackPrevious',
}

let viewportOffsetY = 0
let queueOffsetY = 0
const routeOffsets = new Map<string, number>()
const homeScrollOffsets = new Map<string, number>()
let lastActivatedFocusIdentity = ''
let pendingFocusRestore = ''
let lastHomeFocusedId = ''
const focusRestoreTimers: number[] = []

function focusIdentity(node: HTMLElement | null) {
  if (!node) return ''
  return (node.dataset.tvFocusKey || node.getAttribute('aria-label') || node.textContent || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

function restoreActivatedFocus() {
  if (!pendingFocusRestore) return false
  const target = focusables().find((node) => focusIdentity(node) === pendingFocusRestore)
  if (!target) return false
  target.focus()
  pendingFocusRestore = ''
  return true
}

function scheduleFocusRestore() {
  for (const delay of [0, 80, 250, 750, 1800, 4000, 8000]) {
    focusRestoreTimers.push(window.setTimeout(restoreActivatedFocus, delay))
  }
}

export function normalizeRemoteKey(event: KeyboardEvent) {
  const semantic = `${event.key || ''} ${event.code || ''}`
  if (/arrow?down|\bdown\b/i.test(semantic)) return 'ArrowDown'
  if (/arrow?up|\bup\b/i.test(semantic)) return 'ArrowUp'
  if (/arrow?left|\bleft\b/i.test(semantic)) return 'ArrowLeft'
  if (/arrow?right|\bright\b/i.test(semantic)) return 'ArrowRight'
  return KEY_ALIASES[event.keyCode || event.which] ?? event.key
}

function homeScroller() {
  return document.documentElement.dataset.tvRoute === 'home'
    ? document.querySelector<HTMLElement>('.main-scroll--home')
    : null
}

function diagnosticEnabled() {
  return new URLSearchParams(location.search).get('tvdiag') === '1'
}

function diagnosticIdentity(node: HTMLElement | null) {
  if (!node) return 'none'
  if (node.id) return node.id
  return (node.dataset.tvFocusKey || node.getAttribute('aria-label') || node.textContent || node.tagName)
    .replace(/\s+/g, ' ').trim().slice(0, 42) || node.tagName.toLowerCase()
}

function reportRemoteDiagnostic(keyCode: number, key: string, focused: HTMLElement | null, container: HTMLElement | null) {
  if (!diagnosticEnabled()) return
  document.documentElement.dataset.tvDiag = 'true'
  let overlay = document.getElementById('tv-remote-diagnostic')
  if (!overlay) {
    overlay = document.createElement('aside')
    overlay.id = 'tv-remote-diagnostic'
    overlay.tabIndex = -1
    overlay.setAttribute('aria-hidden', 'true')
    document.body.appendChild(overlay)
  }
  const focusedId = diagnosticIdentity(focused)
  const containerId = container?.id || (container?.classList.contains('main-scroll--home') ? 'home-content-scroller' : 'none')
  const top = Math.round(container?.scrollTop || 0)
  const client = Math.round(container?.clientHeight || 0)
  const height = Math.round(container?.scrollHeight || 0)
  overlay.textContent = `${keyCode}:${key} | ${focusedId} | ${containerId} | ${top} | ${client} | ${height}`
  const query = new URLSearchParams({ event: 'home-remote', keyCode: String(keyCode), key, focusedId, containerId, scrollTop: String(top), clientHeight: String(client), scrollHeight: String(height) })
  fetch(`/__tv_diag?${query}`, { method: 'GET', cache: 'no-store', credentials: 'omit' }).catch(() => {})
}

function reportEventDiagnostic(event: KeyboardEvent, phase: string, before: HTMLElement | null, after: HTMLElement | null, target: HTMLElement | null, scrollBefore: number, scrollAfter: number, renderOverlay = true) {
  if (!diagnosticEnabled()) return
  document.documentElement.dataset.tvDiag = 'true'
  let overlay = document.getElementById('tv-remote-diagnostic')
  if (!overlay) {
    overlay = document.createElement('aside')
    overlay.id = 'tv-remote-diagnostic'
    overlay.tabIndex = -1
    overlay.setAttribute('aria-hidden', 'true')
    document.body.appendChild(overlay)
  }
  const code = event.keyCode || event.which || 0
  const beforeId = diagnosticIdentity(before)
  const afterId = diagnosticIdentity(after)
  const targetId = diagnosticIdentity(target)
  const eventType = `${phase}:${event.type}${event.repeat ? ':repeat' : ''}`
  if (renderOverlay) overlay.textContent = `${eventType} | ${event.key || event.code || 'Unidentified'}/${code} | ${beforeId} → ${afterId} | ${targetId} | ${Math.round(scrollBefore)} → ${Math.round(scrollAfter)}`
  const query = new URLSearchParams({ event: 'home-key-trace', eventType, key: event.key || '', code: event.code || '', keyCode: String(event.keyCode || 0), which: String(event.which || 0), repeat: String(event.repeat), beforeId, afterId, internalFocusedId: lastHomeFocusedId, targetId, scrollBefore: String(Math.round(scrollBefore)), scrollAfter: String(Math.round(scrollAfter)) })
  fetch(`/__tv_diag?${query}`, { method: 'GET', cache: 'no-store', credentials: 'omit' }).catch(() => {})
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
  reportRemoteDiagnostic(keyCode, KEY_ALIASES[keyCode] || String(keyCode), node, queue || viewport)
}

function scrollHomeFocusIntoSafeArea(node: HTMLElement, direction: 'up' | 'down', keyCode: number, pageStep = 0) {
  const scroller = homeScroller()
  if (!scroller) return false
  const bounds = scroller.getBoundingClientRect()
  const item = node.getBoundingClientRect()
  const safeTop = bounds.top + 44
  // Only the persistent bottom transport reduces vertical Home visibility.
  // The contextual Now Playing rail is a side panel and must never collapse
  // the scroller's usable height.
  const bottomPlayer = document.querySelector<HTMLElement>('.player-bar')
  const bottomPlayerRect = bottomPlayer?.getBoundingClientRect()
  const bottomPlayerTop = bottomPlayerRect && bottomPlayerRect.height > 0 ? bottomPlayerRect.top : null
  const safeBottom = Math.min(bounds.bottom - 44, bottomPlayerTop && bottomPlayerTop > bounds.top ? bottomPlayerTop - 24 : bounds.bottom - 44)
  let next = scroller.scrollTop
  if (pageStep) next += pageStep
  else if (item.width <= 0 || item.height <= 0) next += Math.round(scroller.clientHeight * .72) * (direction === 'down' ? 1 : -1)
  else if (item.bottom > safeBottom) next += item.bottom - safeBottom
  else if (item.top < safeTop) next -= safeTop - item.top
  const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
  next = Math.max(0, Math.min(maximum, next))
  if (Math.abs(next - scroller.scrollTop) > .5) {
    scroller.scrollTop = next
    // Some VIDAA builds apply a late native focus adjustment after the key
    // handler. Reassert the same bounded owner position on the next paint.
    requestAnimationFrame(() => {
      const latestMaximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      scroller.scrollTop = Math.max(0, Math.min(latestMaximum, next))
      homeScrollOffsets.set(location.pathname, scroller.scrollTop)
    })
  }
  homeScrollOffsets.set(location.pathname, scroller.scrollTop)
  reportRemoteDiagnostic(keyCode, direction === 'down' ? 'ArrowDown' : 'ArrowUp', node, scroller)
  return true
}
function requestNextPage(node: HTMLElement) {
  const container = node.closest<HTMLElement>('main,section,[class*="page"]')
  const visible = container ? Array.from(container.querySelectorAll<HTMLElement>('button:not([disabled])')).filter(isEligibleFocusTarget) : []
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
  decorateHomeFocusGraph()
}

type HomeFocusTarget = { node: HTMLElement; row: number; col: number }

function visibleButtons(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])'))
    .filter(isEligibleFocusTarget)
}

function isEligibleFocusTarget(node: HTMLElement) {
  if (node.matches(':disabled,[hidden]') || node.closest('[hidden],[inert]')) return false
  if (node.getAttribute('aria-hidden') === 'true') return false
  // Do not use offsetParent/client rects here. VIDAA may defer geometry for
  // controls below the painted viewport even though they are mounted and
  // focusable. Walk computed ancestors instead so off-screen rails remain in
  // the registry before focus moves into them.
  let current: HTMLElement | null = node
  while (current) {
    const style = getComputedStyle(current)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    current = current.parentElement
  }
  return node.isConnected
}

function stableSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42) || 'row'
}

function decorateHomeFocusGraph() {
  if (!homeScroller()) return [] as HomeFocusTarget[]
  const rows: HTMLElement[][] = []
  const search = document.querySelector<HTMLElement>('.main-scroll--home input[type="search"],.main-scroll--home [role="searchbox"]')
  if (search && isEligibleFocusTarget(search)) rows.push([search])
  const hero = document.querySelector<HTMLElement>('.page-view[data-page="home"] .music-home-product-hero-actions')
  const heroButtons = hero ? visibleButtons(hero) : []
  if (heroButtons.length) rows.push(heroButtons)
  document.querySelectorAll<HTMLElement>('.page-view[data-page="home"] .music-home-section').forEach((section) => {
    const buttons = visibleButtons(section).filter((node) => !node.classList.contains('music-home-view-all'))
    if (buttons.length) rows.push(buttons)
  })
  const player = document.querySelector<HTMLElement>('.conditional-player-rail[data-presence="entering"],.conditional-player-rail[data-presence="visible"]')
  const playerButtons = player ? visibleButtons(player) : []
  if (playerButtons.length) rows.push(playerButtons)
  const miniPlayer = document.querySelector<HTMLElement>('.player-bar')
  const miniPlayerButtons = miniPlayer ? visibleButtons(miniPlayer) : []
  if (miniPlayerButtons.length) rows.push(miniPlayerButtons)
  const targets: HomeFocusTarget[] = []
  rows.forEach((nodes, row) => {
    const heading = nodes[0]?.closest('.music-home-section')?.querySelector('h2')?.textContent || (row === 0 ? 'hero' : row === rows.length - 1 && playerButtons.length ? 'player' : `row-${row}`)
    const slug = stableSlug(heading)
    nodes.forEach((node, col) => {
      const id = `tv-home-${slug}-${col}`
      if (!node.id) node.id = id
      node.dataset.tvFocusId = id
      node.dataset.tvHomeRow = String(row)
      node.dataset.tvHomeCol = String(col)
      node.dataset.tvFocusKey = id
      node.tabIndex = 0
      targets.push({ node, row, col })
    })
  })
  const sidebarEntry = document.querySelector<HTMLElement>('.sidebar .nav-item.active,.sidebar .nav-item.is-active,.sidebar [aria-current="page"]')
  if (sidebarEntry && !sidebarEntry.id) sidebarEntry.id = 'tv-home-sidebar-entry'
  const byRow = new Map<number, HomeFocusTarget[]>()
  targets.forEach((entry) => {
    const row = byRow.get(entry.row) || []
    row.push(entry); byRow.set(entry.row, row)
  })
  const targetSelector = (entry: HomeFocusTarget | undefined) => entry?.node.id ? `#${entry.node.id}` : ''
  targets.forEach((entry) => {
    const row = byRow.get(entry.row) || []
    const previousRow = byRow.get(entry.row - 1) || []
    const nextRow = byRow.get(entry.row + 1) || []
    const left = row.find((candidate) => candidate.col === entry.col - 1)
    const right = row.find((candidate) => candidate.col === entry.col + 1)
    const up = previousRow[Math.min(entry.col, Math.max(0, previousRow.length - 1))]
    const down = nextRow[Math.min(entry.col, Math.max(0, nextRow.length - 1))]
    const leftSelector = targetSelector(left) || (entry.col === 0 && sidebarEntry?.id ? `#${sidebarEntry.id}` : '')
    for (const [direction, selector] of [['left', leftSelector], ['right', targetSelector(right)], ['up', targetSelector(up)], ['down', targetSelector(down)]] as const) {
      if (selector) entry.node.style.setProperty(`nav-${direction}`, selector)
      else entry.node.style.removeProperty(`nav-${direction}`)
    }
  })
  const heroPrimary = targets.find((entry) => entry.node.closest('.music-home-product-hero-actions'))
  if (sidebarEntry && heroPrimary?.node.id) sidebarEntry.style.setProperty('nav-right', `#${heroPrimary.node.id}`)
  return targets
}

function focusWithoutNativeScroll(target: HTMLElement) {
  try { target.focus({ preventScroll: true }) }
  catch { target.focus() }
  if (document.activeElement !== target) return false
  lastHomeFocusedId = target.dataset.tvFocusId || target.id
  return true
}

function moveHomeFocus(key: string, keyCode: number) {
  const targets = decorateHomeFocusGraph()
  if (!targets.length) return false
  const active = document.activeElement as HTMLElement | null
  const current = targets.find((entry) => entry.node === active)
  if (!current) {
    if (key !== 'ArrowRight') return false
    if (!active?.closest('.sidebar')) return false
    const remembered = targets.find((entry) => (entry.node.dataset.tvFocusId || entry.node.id) === lastHomeFocusedId)
    const first = remembered || targets.find((entry) => entry.node.closest('.music-home-product-hero-actions')) || targets[0]!
    if (!focusWithoutNativeScroll(first.node)) {
      scrollHomeFocusIntoSafeArea(first.node, 'down', keyCode, Math.round((homeScroller()?.clientHeight || innerHeight) * .72))
      if (!focusWithoutNativeScroll(first.node)) return false
    }
    scrollHomeFocusIntoSafeArea(first.node, 'down', keyCode)
    return true
  }
  let target: HomeFocusTarget | undefined
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const delta = key === 'ArrowRight' ? 1 : -1
    target = targets.find((entry) => entry.row === current.row && entry.col === current.col + delta)
    if (!target && key === 'ArrowLeft' && current.col === 0) {
      const sidebar = document.querySelector<HTMLElement>('.sidebar .nav-item.active,.sidebar .nav-item.is-active,.sidebar [aria-current="page"]')
      if (!sidebar) return false
      return focusWithoutNativeScroll(sidebar)
    }
  } else {
    const delta = key === 'ArrowDown' ? 1 : -1
    const nextRow = current.row + delta
    const rowTargets = targets.filter((entry) => entry.row === nextRow)
    const currentCenter = current.node.getBoundingClientRect().left + current.node.getBoundingClientRect().width / 2
    target = rowTargets.sort((a, b) => {
      const aRect = a.node.getBoundingClientRect(); const bRect = b.node.getBoundingClientRect()
      return Math.abs(aRect.left + aRect.width / 2 - currentCenter) - Math.abs(bRect.left + bRect.width / 2 - currentCenter)
    })[0]
  }
  if (!target) return false
  if (!focusWithoutNativeScroll(target.node)) {
    const direction = key === 'ArrowUp' ? 'up' : 'down'
    const step = Math.round((homeScroller()?.clientHeight || innerHeight) * .72) * (direction === 'up' ? -1 : 1)
    scrollHomeFocusIntoSafeArea(target.node, direction, keyCode, step)
    if (!focusWithoutNativeScroll(target.node)) return false
  }
  scrollHomeFocusIntoSafeArea(target.node, key === 'ArrowUp' ? 'up' : 'down', keyCode)
  requestNextPage(target.node)
  return true
}

function moveFocus(key: string, keyCode: number) {
  if (homeScroller()) {
    const active = document.activeElement as HTMLElement | null
    const homeOwnsDirection = Boolean(active?.closest('[data-tv-home-row]'))
      || (key === 'ArrowRight' && Boolean(active?.closest('.sidebar')))
    if (homeOwnsDirection) return moveHomeFocus(key, keyCode)
  }
  const nodes = focusables()
  if (!nodes.length) return false
  const active = document.activeElement as HTMLElement | null
  const from = active?.getBoundingClientRect()
  if (!from) { nodes[0]?.focus(); return Boolean(nodes[0]) }
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
    if (!scrollHomeFocusIntoSafeArea(target, positive ? 'down' : 'up', keyCode)) translateFocused(target, keyCode)
    requestNextPage(target)
    return true
  } else {
    if (active && !scrollHomeFocusIntoSafeArea(active, positive ? 'down' : 'up', keyCode, Math.round(innerHeight * .6) * (positive ? 1 : -1))) {
      translateFocused(active, keyCode, Math.round(innerHeight * .6) * (positive ? -1 : 1))
    }
  }
  return false
}

function hasClosableLayer() {
  return Boolean(document.querySelector(
    '[role="dialog"],.premium-player-overlay,.player-mode-switcher-menu,[aria-modal="true"]',
  ))
}

let homeSidebarProxy: HTMLButtonElement | null = null

function ensureHomeSidebarProxy() {
  if (homeSidebarProxy?.isConnected) return homeSidebarProxy
  const proxy = document.createElement('button')
  proxy.type = 'button'; proxy.id = 'tv-home-sidebar-proxy'; proxy.tabIndex = 0
  proxy.className = 'tv-home-sidebar-proxy'; proxy.setAttribute('aria-label', 'Return to navigation')
  document.body.appendChild(proxy); homeSidebarProxy = proxy
  return proxy
}

function scopeSidebarForHomeFocus(homeOwnsFocus: boolean, anchor?: HTMLElement | null) {
  const sidebar = document.querySelector<HTMLElement>('.sidebar')
  sidebar?.classList.toggle('tv-spatial-suspended', homeOwnsFocus)
  document.querySelectorAll<HTMLButtonElement>('.sidebar button.nav-item').forEach((item) => {
    if (!item.dataset.tvOriginalDisabled) item.dataset.tvOriginalDisabled = String(item.disabled)
    item.disabled = homeOwnsFocus ? true : item.dataset.tvOriginalDisabled === 'true'
    item.tabIndex = homeOwnsFocus ? -1 : 0
  })
  const proxy = ensureHomeSidebarProxy()
  proxy.disabled = !homeOwnsFocus
  proxy.tabIndex = homeOwnsFocus ? 0 : -1
  if (homeOwnsFocus && anchor) {
    const anchorRect = anchor.getBoundingClientRect(); const sidebarRect = sidebar?.getBoundingClientRect()
    proxy.style.left = `${Math.max(0, (sidebarRect?.right || anchorRect.left) + 2)}px`
    proxy.style.top = `${Math.max(0, anchorRect.top + anchorRect.height / 2 - 5)}px`
  }
}

export function installTvRemoteControls() {
  const openerSelector = '.audiobook-book-card-hit,.podcast-featured-card-hit,.podcast-show-card-hit,.motivationals-program-card-hit,.lecture-series-card-hit,.lectures-program-card-hit,.page-view[data-page="home"] button'
  const rememberOpener = (target: EventTarget | null) => {
    const opener = (target as Element | null)?.closest?.<HTMLElement>(openerSelector)
    if (opener) lastActivatedFocusIdentity = focusIdentity(opener)
  }
  const onActivationClick = (event: MouseEvent) => {
    rememberOpener(event.target)
  }
  const onActivationFocus = (event: FocusEvent) => {
    rememberOpener(event.target)
    if (event.target === homeSidebarProxy) {
      scopeSidebarForHomeFocus(false)
      const sidebarEntry = document.querySelector<HTMLElement>('.sidebar .nav-item.active,.sidebar .nav-item.is-active,.sidebar [aria-current="page"]')
      focusWithoutNativeScroll(sidebarEntry || document.querySelector<HTMLElement>('.sidebar .nav-item')!)
      return
    }
    const homeTarget = (event.target as Element | null)?.closest?.<HTMLElement>('[data-tv-home-row]')
    if (homeTarget) {
      lastHomeFocusedId = homeTarget.dataset.tvFocusId || homeTarget.id
      scopeSidebarForHomeFocus(true, homeTarget)
    } else if ((event.target as Element | null)?.closest?.('.sidebar')) {
      scopeSidebarForHomeFocus(false)
    }
  }
  const handleKey = (event: KeyboardEvent, key: string) => {
    const target = event.target as HTMLElement | null
    const isTextEntry = target?.matches('input,textarea,[contenteditable="true"]') === true
    if (event.key === 'Backspace' && !isTextEntry) key = 'Back'
    if (key === 'Enter') {
      lastActivatedFocusIdentity = focusIdentity(document.activeElement as HTMLElement | null)
      return false
    }
    if (key.startsWith('Arrow')) {
      return moveFocus(key, event.keyCode || event.which)
    }
    if (key === 'Back') {
      pendingFocusRestore = lastActivatedFocusIdentity
      if (document.fullscreenElement) void document.exitFullscreen()
      else if (hasClosableLayer()) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      else {
        const inAppBack = focusables().find((node) => /\bBack(?:\s|$)/i.test((node.textContent || '').trim()))
        if (inAppBack) {
          inAppBack.click()
          scheduleFocusRestore()
        }
        else if (history.length > 1) history.back()
      }
      return true
    }
    const media = document.querySelector<HTMLMediaElement>('video, audio')
    if (!media) return false
    if (key === 'MediaPlay' || key === 'MediaPause' || key === 'MediaPlayPause') {
      if (media.paused) void media.play(); else media.pause()
    } else if (key === 'MediaStop') {
      media.pause(); media.currentTime = 0
    } else if (key === 'MediaFastForward' && Number.isFinite(media.duration)) {
      media.currentTime = Math.min(media.duration, media.currentTime + 10)
    } else if (key === 'MediaRewind') {
      media.currentTime = Math.max(0, media.currentTime - 10)
    } else return false
    return true
  }
  const onRemoteEvent = (event: KeyboardEvent) => {
    const scroller = homeScroller()
    const before = document.activeElement as HTMLElement | null
    const scrollBefore = scroller?.scrollTop || 0
    const key = normalizeRemoteKey(event)
    const handled = handleKey(event, key)
    const after = document.activeElement as HTMLElement | null
    const scrollAfter = scroller?.scrollTop || 0
    if (new URLSearchParams(location.search).get('tvbridge') === '1' && key.startsWith('Arrow')) {
      const targetRect = after?.getBoundingClientRect()
      const scrollerRect = scroller?.getBoundingClientRect()
      dispatchEvent(new CustomEvent('ht-tv-focus-decision', { detail: {
        direction: key, handled, activeBefore: diagnosticIdentity(before), activeAfter: diagnosticIdentity(after),
        internalFocusedId: lastHomeFocusedId || 'none', resolvedTarget: after !== before ? diagnosticIdentity(after) : 'none',
        targetRect: targetRect ? { x: targetRect.x, y: targetRect.y, width: targetRect.width, height: targetRect.height, top: targetRect.top, right: targetRect.right, bottom: targetRect.bottom, left: targetRect.left } : null,
        scrollerRect: scrollerRect ? { x: scrollerRect.x, y: scrollerRect.y, width: scrollerRect.width, height: scrollerRect.height, top: scrollerRect.top, right: scrollerRect.right, bottom: scrollerRect.bottom, left: scrollerRect.left } : null,
        scrollTopBefore: scrollBefore, scrollTopAfter: scrollAfter,
        clientHeight: scroller?.clientHeight || 0, scrollHeight: scroller?.scrollHeight || 0,
      } }))
    }
    reportEventDiagnostic(event, 'window-capture', before, after, after !== before ? after : null, scrollBefore, scrollAfter)
    if (handled) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }
  addEventListener('click', onActivationClick, true)
  addEventListener('focusin', onActivationFocus, true)
  addEventListener('keydown', onRemoteEvent, true)
  const restoreOffset = () => {
    const scroller = homeScroller()
    if (scroller) {
      scroller.scrollTop = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, homeScrollOffsets.get(location.pathname) || 0))
      requestAnimationFrame(() => requestAnimationFrame(restoreActivatedFocus))
      return
    }
    viewportOffsetY = routeOffsets.get(location.pathname) || 0
    const content = document.querySelector<HTMLElement>('.main-scroll .page-view')
    if (content) {
      content.style.setProperty('--tv-offset-y', String(viewportOffsetY) + 'px')
      content.classList.add('tv-route-translated')
    }
    requestAnimationFrame(() => requestAnimationFrame(restoreActivatedFocus))
  }
  addEventListener('popstate', restoreOffset)
  const focusFirst = () => {
    if (document.activeElement !== document.body && document.activeElement) return
    if (homeScroller()) {
      const homeTargets = decorateHomeFocusGraph()
      const heroPrimary = homeTargets.find((entry) => entry.node.closest('.music-home-product-hero-actions'))
      if (heroPrimary && focusWithoutNativeScroll(heroPrimary.node)) return
    }
    focusables()[0]?.focus()
  }
  requestAnimationFrame(() => { enhanceTvDom(); focusFirst() })
  const observer = new MutationObserver(() => {
    enhanceTvDom()
    if (!restoreActivatedFocus()) focusFirst()
  })
  observer.observe(document.body, { childList: true, subtree: true })
  return () => {
    for (const timer of focusRestoreTimers.splice(0)) clearTimeout(timer)
    removeEventListener('click', onActivationClick, true)
    removeEventListener('focusin', onActivationFocus, true)
    removeEventListener('keydown', onRemoteEvent, true)
    removeEventListener('popstate', restoreOffset)
    scopeSidebarForHomeFocus(false)
    homeSidebarProxy?.remove(); homeSidebarProxy = null
    observer.disconnect()
  }
}
