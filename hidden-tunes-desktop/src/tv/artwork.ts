const FALLBACK_ARTWORK = '/__tv_art/fallback.jpg'
const APPROVED_ARTWORK_ORIGIN = 'https://pub-cdc7ab995ca34ff1b3f95453a8024aa3.r2.dev'
const PLAYER_ARTWORK_SELECTOR = '.player-bar .player-artwork img,.ht-player-art-frame img,.premium-shell-art-frame img,.ht-player-queue-section img,.queue-now-card img'
const PROVEN_PLAYER_ARTWORK = '/__tv_art/player.jpg'
const SURFACES = [
  ['miniArtwork', '.player-bar .player-artwork'],
  ['mainArtwork', '.ht-player-art-frame'],
  ['fullArtwork', '.premium-shell-art-frame'],
  ['queueArtwork', '.ht-player-queue-section .art-frame,.queue-now-card .art-frame'],
] as const

type ResolvedArtwork = { mediaId: string; url: string; decoded: boolean; width: number; height: number }
const resolvedByMediaId = new Map<string, ResolvedArtwork>()
let activeResolved: ResolvedArtwork | null = null

function diagnostic(message: string) {
  let overlay = document.getElementById('tv-artwork-diagnostic')
  if (!overlay) {
    overlay = document.createElement('aside')
    overlay.id = 'tv-artwork-diagnostic'
    overlay.tabIndex = -1
    overlay.setAttribute('aria-hidden', 'true')
    document.body.appendChild(overlay)
  }
  const script = Array.from(document.scripts).map((item) => item.src).find((src) => /\/assets\/tv-[^/]+\.js/.test(src)) || 'pending'
  overlay.textContent = `TV ${script.split('/').pop()} | ${message}`
}

function report(event: string, image: HTMLImageElement) {
  const source = image.currentSrc || image.src
  const kind = source.includes(PROVEN_PLAYER_ARTWORK) ? 'static-proxy-baseline-rgb' : source.includes('/__tv_artwork/') ? (source.includes('compat=1') ? 'proxy-baseline-jpeg' : 'proxy-original') : (source.endsWith(FALLBACK_ARTWORK) ? 'logo-fallback-resized' : 'direct')
  diagnostic(`${kind} | ${event} | ${image.naturalWidth}x${image.naturalHeight}`)
  const query = new URLSearchParams({ event, kind, width: String(image.naturalWidth), height: String(image.naturalHeight) })
  fetch(`/__tv_diag?${query}`, { method: 'GET', cache: 'no-store', credentials: 'omit' }).catch(() => {})
}

function visibility(node: HTMLElement) {
  const style = getComputedStyle(node); const box = node.getBoundingClientRect()
  return `${style.display}/${style.visibility}/o${style.opacity}/${Math.round(box.width)}x${Math.round(box.height)}/z${style.zIndex}`
}

function showSurfaceDiagnostics() {
  if (!activeResolved) return
  const resolved = activeResolved
  const rows = SURFACES.slice(0, 2).map(([name, selector]) => {
    const image = document.querySelector<HTMLImageElement>(`${selector} img.tv-resolved-artwork`)
    return `${name}=${image ? `${resolved.url} decoded=${resolved.decoded} ${resolved.width}x${resolved.height} ${visibility(image)}` : 'missing'}`
  })
  diagnostic(rows.join(' | '))
}

function bindResolvedArtwork(state: ResolvedArtwork) {
  activeResolved = state
  for (const [surface, selector] of SURFACES) {
    document.querySelectorAll<HTMLElement>(selector).forEach((container) => {
      const image = container.querySelector<HTMLImageElement>('img')
      if (!image) return
      image.classList.add('tv-resolved-artwork', `tv-resolved-artwork--${surface}`)
      if (image.src !== new URL(state.url, location.href).href) image.src = state.url
      image.dataset.tvArtLoaded = String(state.decoded)
      image.dataset.tvMediaId = state.mediaId
    })
  }
  requestAnimationFrame(showSurfaceDiagnostics)
}

function resolveForMedia(mediaId: string) {
  const existing = resolvedByMediaId.get(mediaId)
  if (existing?.decoded) return void bindResolvedArtwork(existing)
  const pending: ResolvedArtwork = existing || { mediaId, url: PROVEN_PLAYER_ARTWORK, decoded: false, width: 0, height: 0 }
  resolvedByMediaId.set(mediaId, pending)
  const preload = new Image()
  preload.onload = () => {
    pending.decoded = preload.naturalWidth > 0
    pending.width = preload.naturalWidth
    pending.height = preload.naturalHeight
    if (pending.decoded) bindResolvedArtwork(pending)
  }
  preload.onerror = () => diagnostic(`sharedArtwork=${mediaId} decode-error previous-preserved`)
  preload.src = pending.url
}

export function installTvArtworkCompatibility() {
  const tvWindow = window as typeof window & { __HT_TV_RESOLVE_ARTWORK__?: (src: string | null, mediaId: string) => string | null }
  tvWindow.__HT_TV_RESOLVE_ARTWORK__ = (src) => {
    if (!src) return src
    try {
      const original = new URL(src, location.href)
      return original.origin === APPROVED_ARTWORK_ORIGIN && (/^\/covers\//.test(original.pathname) || /^\/artists\//.test(original.pathname)) ? PROVEN_PLAYER_ARTWORK : src
    } catch { return src }
  }
  const preparedImages = new WeakSet<HTMLImageElement>()
  const preparedMedia = new WeakSet<HTMLMediaElement>()
  const updatePlaybackState = () => {
    const media = document.querySelector<HTMLMediaElement>('audio,video')
    document.documentElement.dataset.tvMediaPlaying = String(Boolean(media && !media.paused && !media.ended && media.readyState >= 2))
  }
  const prepareImage = (image: HTMLImageElement) => {
    if (preparedImages.has(image)) return
    preparedImages.add(image)
    image.loading = 'eager'
    image.decoding = 'async'
    let compatibilityAttempted = false
    const loaded = () => {
      image.dataset.tvArtLoaded = String(image.naturalWidth > 0)
      image.dataset.tvArtFallback = String(image.src.endsWith(FALLBACK_ARTWORK))
      report(image.naturalWidth > 0 ? 'decode-complete' : 'decode-empty', image)
    }
    image.addEventListener('load', loaded)
    image.addEventListener('error', () => {
      image.dataset.tvArtLoaded = 'false'
      report('decode-error', image)
      if (image.src.includes('/__tv_artwork/') && !compatibilityAttempted) {
        compatibilityAttempted = true
        image.src = `${image.src.split('?')[0]}?compat=1`
        diagnostic('proxy-baseline-jpeg | retry-once')
        return
      }
      if (!image.src.endsWith(FALLBACK_ARTWORK)) setTimeout(() => { image.src = FALLBACK_ARTWORK }, 1200)
    })
    try {
      const original = new URL(image.currentSrc || image.src, location.href)
      if (original.origin === APPROVED_ARTWORK_ORIGIN && (/^\/covers\//.test(original.pathname) || /^\/artists\//.test(original.pathname))) {
        image.dataset.tvOriginalArtwork = original.href
        image.removeAttribute('srcset')
        image.src = PROVEN_PLAYER_ARTWORK
        diagnostic('static-proxy-baseline-rgb | /__tv_art/player.jpg')
      } else if (image.complete) loaded()
    } catch {
      if (image.complete) loaded()
    }
  }
  const prepareMedia = (media: HTMLMediaElement) => {
    if (preparedMedia.has(media)) return
    preparedMedia.add(media)
    for (const event of ['play', 'playing', 'pause', 'waiting', 'stalled', 'ended', 'emptied']) media.addEventListener(event, updatePlaybackState)
  }
  const scan = () => {
    document.querySelectorAll<HTMLImageElement>(PLAYER_ARTWORK_SELECTOR).forEach(prepareImage)
    const candidate = Array.from(document.querySelectorAll<HTMLImageElement>(PLAYER_ARTWORK_SELECTOR)).find((image) => !image.classList.contains('tv-resolved-artwork') && Boolean(image.dataset.tvOriginalArtwork || image.src))
    if (candidate) {
      const source = candidate.dataset.tvOriginalArtwork || candidate.src
      const mediaId = source.split('/').pop()?.split('?')[0] || 'active-media'
      resolveForMedia(mediaId)
    } else if (activeResolved) bindResolvedArtwork(activeResolved)
    document.querySelectorAll<HTMLMediaElement>('audio,video').forEach(prepareMedia)
    updatePlaybackState()
  }
  scan()
  const observer = new MutationObserver(scan)
  observer.observe(document.body, { childList: true, subtree: true })
  return () => { observer.disconnect(); delete tvWindow.__HT_TV_RESOLVE_ARTWORK__ }
}
