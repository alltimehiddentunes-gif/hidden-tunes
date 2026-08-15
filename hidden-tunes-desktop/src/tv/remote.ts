const KEY_ALIASES: Record<number, string> = {
  8: 'Back', 13: 'Enter', 27: 'Back', 37: 'ArrowLeft', 38: 'ArrowUp',
  39: 'ArrowRight', 40: 'ArrowDown', 10009: 'Back', 461: 'Back',
  415: 'MediaPlay', 19: 'MediaPause', 413: 'MediaStop', 417: 'MediaFastForward',
  412: 'MediaRewind', 176: 'MediaTrackNext', 177: 'MediaTrackPrevious',
}

export function normalizeRemoteKey(event: KeyboardEvent) {
  return KEY_ALIASES[event.keyCode] ?? event.key
}

function focusables() {
  return Array.from(document.querySelectorAll<HTMLElement>(
    'button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])',
  )).filter((node) => node.offsetParent !== null && node.getAttribute('aria-hidden') !== 'true')
}

function revealFocused(node: HTMLElement) {
  try { node.scrollIntoView(false) } catch { /* explicit ancestor scrolling below is authoritative */ }
  let parent = node.parentElement
  while (parent) {
    const bounds = parent.getBoundingClientRect()
    const item = node.getBoundingClientRect()
    if (parent.scrollHeight > parent.clientHeight + 2) {
      if (item.bottom > bounds.bottom - 18) parent.scrollTop += item.bottom - bounds.bottom + 36
      if (item.top < bounds.top + 18) parent.scrollTop -= bounds.top - item.top + 36
    }
    if (parent.scrollWidth > parent.clientWidth + 2) {
      if (item.right > bounds.right - 18) parent.scrollLeft += item.right - bounds.right + 36
      if (item.left < bounds.left + 18) parent.scrollLeft -= bounds.left - item.left + 36
    }
    parent = parent.parentElement
  }
  const viewportItem = node.getBoundingClientRect()
  const page = document.scrollingElement
  if (page) {
    if (viewportItem.bottom > innerHeight - 24) page.scrollTop += viewportItem.bottom - innerHeight + 48
    if (viewportItem.top < 24) page.scrollTop -= 48 - viewportItem.top
  }
}

function scrollCurrentRegion(active: HTMLElement | null, key: string) {
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight'
  const positive = key === 'ArrowRight' || key === 'ArrowDown'
  let region = active?.parentElement ?? null
  while (region) {
    const hasRange = horizontal
      ? region.scrollWidth > region.clientWidth + 2
      : region.scrollHeight > region.clientHeight + 2
    if (hasRange) {
      const amount = Math.round((horizontal ? region.clientWidth : region.clientHeight) * 0.72) * (positive ? 1 : -1)
      if (horizontal) region.scrollLeft += amount
      else region.scrollTop += amount
      return
    }
    region = region.parentElement
  }
  if (horizontal) window.scrollBy(positive ? Math.round(innerWidth * 0.72) : -Math.round(innerWidth * 0.72), 0)
  else window.scrollBy(0, positive ? Math.round(innerHeight * 0.72) : -Math.round(innerHeight * 0.72))
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

function moveFocus(key: string) {
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
    revealFocused(target)
    requestNextPage(target)
  } else {
    scrollCurrentRegion(active, key)
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
      moveFocus(key)
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
  const focusFirst = () => {
    if (document.activeElement === document.body || !document.activeElement) focusables()[0]?.focus()
  }
  requestAnimationFrame(() => { enhanceTvDom(); focusFirst() })
  const observer = new MutationObserver(() => { enhanceTvDom(); focusFirst() })
  observer.observe(document.body, { childList: true, subtree: true })
  return () => { removeEventListener('keydown', onKey, true); observer.disconnect() }
}
