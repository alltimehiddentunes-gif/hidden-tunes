const FALLBACK_ARTWORK = '/__tv_art/fallback.jpg'
const APPROVED_ARTWORK_ORIGIN = 'https://pub-cdc7ab995ca34ff1b3f95453a8024aa3.r2.dev'
const PLAYER_ARTWORK_SELECTOR = '.player-bar .player-artwork img,.ht-player-art-frame img,.premium-shell-art-frame img'
const MAX_RESOLVED_ARTWORK = 24
const SURFACES = [
  ['miniArtwork', '.player-bar .player-artwork'],
  ['mainArtwork', '.ht-player-art-frame'],
  ['fullArtwork', '.premium-shell-art-frame'],
] as const

type ResolvedArtwork = { mediaId: string; artworkUrl: string; url: string; decoded: boolean; width: number; height: number }
type ArtworkInput = { url: string | null; field: string }
const resolvedByArtworkUrl = new Map<string, ResolvedArtwork>()
let activeResolved: ResolvedArtwork | null = null
let activeRequestKey = ''
let requestSequence = 0

function normalizeArtworkUrl(raw: string | null | undefined) {
  if (!raw) return null
  try {
    const url = new URL(raw, location.href)
    if (url.origin !== APPROVED_ARTWORK_ORIGIN || !/^\/(covers|artists)\//.test(url.pathname) || url.pathname.includes('..') || url.pathname.includes('\\')) return null
    return `${APPROVED_ARTWORK_ORIGIN}${url.pathname}`
  } catch { return null }
}

function selectArtworkInput(media: unknown, displayArtwork: string | null): ArtworkInput {
  const record = media && typeof media === 'object' ? media as Record<string, unknown> : {}
  const aliases = ['artwork', 'artworkUrl', 'artwork_url', 'image', 'imageUrl', 'image_url', 'cover', 'coverUrl', 'cover_url', 'thumbnail'] as const
  const candidates = aliases.map((field) => ({ field, url: typeof record[field] === 'string' ? normalizeArtworkUrl(record[field] as string) : null })).filter((item) => item.url)
  const cover = candidates.find((item) => new URL(item.url!).pathname.startsWith('/covers/'))
  const selected = cover || candidates[0]
  if (selected) return { url: selected.url, field: selected.field }
  return { url: normalizeArtworkUrl(displayArtwork), field: displayArtwork ? 'displayArtwork' : 'missing' }
}

function touchCache(url: string, state: ResolvedArtwork) {
  resolvedByArtworkUrl.delete(url)
  resolvedByArtworkUrl.set(url, state)
  while (resolvedByArtworkUrl.size > MAX_RESOLVED_ARTWORK) resolvedByArtworkUrl.delete(resolvedByArtworkUrl.keys().next().value as string)
}

function diagnostic(message: string) {
  let overlay = document.getElementById('tv-artwork-diagnostic')
  if (!overlay) {
    overlay = document.createElement('aside'); overlay.id = 'tv-artwork-diagnostic'; overlay.tabIndex = -1
    overlay.setAttribute('aria-hidden', 'true'); document.body.appendChild(overlay)
  }
  const script = Array.from(document.scripts).map((item) => item.src).find((src) => /\/assets\/tv-[^/]+\.js/.test(src)) || 'pending'
  overlay.textContent = `TV ${script.split('/').pop()} | ${message}`
}

function report(event: string, image: HTMLImageElement) {
  const source = image.currentSrc || image.src
  const kind = /\/__tv_art\/[a-f0-9]{24}\.jpg$/.test(new URL(source, location.href).pathname) ? 'hashed-baseline-rgb' : (source.endsWith(FALLBACK_ARTWORK) ? 'logo-fallback-resized' : 'direct')
  diagnostic(`${kind} | ${event} | ${image.naturalWidth}x${image.naturalHeight}`)
  const query = new URLSearchParams({ event, kind, width: String(image.naturalWidth), height: String(image.naturalHeight) })
  fetch(`/__tv_diag?${query}`, { method: 'GET', cache: 'no-store', credentials: 'omit' }).catch(() => {})
}

function visibility(node: HTMLElement) {
  const style = getComputedStyle(node); const box = node.getBoundingClientRect()
  return `${style.display}/${style.visibility}/o${style.opacity}/${Math.round(box.width)}x${Math.round(box.height)}/z${style.zIndex}`
}

function bindResolvedArtwork(state: ResolvedArtwork) {
  activeResolved = state
  for (const [surface, selector] of SURFACES) {
    document.querySelectorAll<HTMLElement>(selector).forEach((container) => {
      const image = container.querySelector<HTMLImageElement>('img'); if (!image) return
      const original = normalizeArtworkUrl(image.dataset.tvOriginalArtwork)
      if (original && original !== state.artworkUrl) return
      image.classList.add('tv-resolved-artwork', `tv-resolved-artwork--${surface}`)
      if (image.src !== new URL(state.url, location.href).href) image.src = state.url
      image.dataset.tvArtLoaded = 'true'
      if (image.dataset.tvMediaId !== state.mediaId) image.dataset.tvMediaId = state.mediaId
      image.dataset.tvResolvedArtwork = state.artworkUrl
    })
  }
  requestAnimationFrame(() => {
    const rows = SURFACES.slice(0, 2).map(([name, selector]) => {
      const image = document.querySelector<HTMLImageElement>(`${selector} img.tv-resolved-artwork`)
      return `${name}=${image ? `${state.url} ${state.width}x${state.height} ${visibility(image)}` : 'missing'}`
    })
    diagnostic(rows.join(' | '))
  })
}

function bindFallback(mediaId: string, artworkUrl: string) {
  bindResolvedArtwork({ mediaId, artworkUrl, url: FALLBACK_ARTWORK, decoded: true, width: 0, height: 0 })
}

async function resolveForMedia(mediaId: string, rawArtworkUrl: string, artworkField: string) {
  const artworkUrl = normalizeArtworkUrl(rawArtworkUrl)
  const requestKey = `${mediaId}\n${artworkUrl || 'missing'}`
  if (requestKey === activeRequestKey) {
    if (activeResolved?.artworkUrl === artworkUrl) bindResolvedArtwork(activeResolved)
    return
  }
  activeRequestKey = requestKey
  const sequence = ++requestSequence
  if (!artworkUrl) {
    bindFallback(mediaId, ''); return
  }
  const cached = resolvedByArtworkUrl.get(artworkUrl)
  if (cached?.decoded) {
    const state = { ...cached, mediaId }; touchCache(artworkUrl, state); bindResolvedArtwork(state); return
  }
  try {
    const registrationUrl = new URL('/__tv_art/register', location.href)
    registrationUrl.searchParams.set('src', artworkUrl); registrationUrl.searchParams.set('media', mediaId); registrationUrl.searchParams.set('field', artworkField)
    const registration = await fetch(registrationUrl, { method: 'GET', cache: 'no-store', credentials: 'omit' })
    if (!registration.ok) throw new Error(`register-${registration.status}`)
    const payload = await registration.json() as { artworkUrl?: string; derivativeUrl?: string }
    if (payload.artworkUrl !== artworkUrl || !/^\/__tv_art\/[a-f0-9]{24}\.jpg$/.test(payload.derivativeUrl || '')) throw new Error('register-invalid')
    const pending: ResolvedArtwork = { mediaId, artworkUrl, url: payload.derivativeUrl!, decoded: false, width: 0, height: 0 }
    let ready = false
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const probe = await fetch(pending.url, { method: 'HEAD', cache: 'no-store', credentials: 'omit' })
      if (probe.ok && probe.headers.get('content-type') === 'image/jpeg') { ready = true; break }
      if (probe.status !== 503 || attempt > 0) throw new Error(`derivative-${probe.status}`)
      await new Promise((resolve) => setTimeout(resolve, 900))
      if (sequence !== requestSequence || requestKey !== activeRequestKey) return
    }
    if (!ready) throw new Error('derivative-not-ready')
    const preload = new Image()
    preload.onload = () => {
      pending.decoded = preload.naturalWidth > 0; pending.width = preload.naturalWidth; pending.height = preload.naturalHeight
      if (!pending.decoded) return
      touchCache(artworkUrl, pending)
      if (sequence !== requestSequence || requestKey !== activeRequestKey) return void diagnostic(`staleArtwork=${mediaId} ignored`)
      bindResolvedArtwork(pending)
    }
    preload.onerror = () => {
      if (sequence !== requestSequence || requestKey !== activeRequestKey) return
      diagnostic(`sharedArtwork=${mediaId} decode-error logo-fallback`); bindFallback(mediaId, artworkUrl)
    }
    preload.src = pending.url
  } catch {
    if (sequence === requestSequence && requestKey === activeRequestKey) {
      diagnostic(`sharedArtwork=${mediaId} resolve-error logo-fallback`); bindFallback(mediaId, artworkUrl)
    }
  }
}

export function installTvArtworkCompatibility() {
  const tvWindow = window as typeof window & {
    __HT_TV_RESOLVE_ARTWORK__?: (src: string | null, mediaId: string) => string | null
    __HT_TV_SELECT_ARTWORK__?: (media: unknown, displayArtwork: string | null) => ArtworkInput
  }
  tvWindow.__HT_TV_RESOLVE_ARTWORK__ = (src) => normalizeArtworkUrl(src) ? FALLBACK_ARTWORK : src
  tvWindow.__HT_TV_SELECT_ARTWORK__ = selectArtworkInput
  const preparedImages = new WeakSet<HTMLImageElement>(); const preparedMedia = new WeakSet<HTMLMediaElement>()
  const updatePlaybackState = () => {
    const media = document.querySelector<HTMLMediaElement>('audio,video')
    document.documentElement.dataset.tvMediaPlaying = String(Boolean(media && !media.paused && !media.ended && media.readyState >= 2))
  }
  const prepareImage = (image: HTMLImageElement) => {
    if (preparedImages.has(image)) return
    preparedImages.add(image); image.loading = 'eager'; image.decoding = 'async'
    image.addEventListener('load', () => { image.dataset.tvArtLoaded = String(image.naturalWidth > 0); report(image.naturalWidth > 0 ? 'decode-complete' : 'decode-empty', image) })
    image.addEventListener('error', () => { image.dataset.tvArtLoaded = 'false'; report('decode-error', image); if (!activeResolved && !image.src.endsWith(FALLBACK_ARTWORK)) image.src = FALLBACK_ARTWORK })
  }
  const prepareMedia = (media: HTMLMediaElement) => {
    if (preparedMedia.has(media)) return
    preparedMedia.add(media); for (const event of ['play', 'playing', 'pause', 'waiting', 'stalled', 'ended', 'emptied']) media.addEventListener(event, updatePlaybackState)
  }
  const scan = () => {
    const images = Array.from(document.querySelectorAll<HTMLImageElement>(PLAYER_ARTWORK_SELECTOR)); images.forEach(prepareImage)
    const candidate = document.querySelector<HTMLImageElement>('.ht-player-art-frame img[data-tv-original-artwork]')
      || document.querySelector<HTMLImageElement>('.premium-shell-art-frame img[data-tv-original-artwork]')
      || document.querySelector<HTMLImageElement>('.player-bar .player-artwork img[data-tv-original-artwork]')
    if (candidate) void resolveForMedia(candidate.dataset.tvMediaId || 'active-media', candidate.dataset.tvOriginalArtwork || '', candidate.dataset.tvArtworkField || 'unknown')
    else if (activeResolved) bindResolvedArtwork(activeResolved)
    document.querySelectorAll<HTMLMediaElement>('audio,video').forEach(prepareMedia); updatePlaybackState()
  }
  scan()
  const observer = new MutationObserver(scan); observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tv-original-artwork', 'data-tv-media-id', 'data-tv-artwork-field'] })
  return () => { observer.disconnect(); requestSequence += 1; delete tvWindow.__HT_TV_RESOLVE_ARTWORK__; delete tvWindow.__HT_TV_SELECT_ARTWORK__ }
}
