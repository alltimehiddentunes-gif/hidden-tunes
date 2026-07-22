'use strict'

const fs = require('fs')
const path = require('path')
const { pipeline } = require('stream/promises')
const { createWriteStream } = require('fs')
const { Readable } = require('stream')
const { fetchApprovedCatalog } = require('../catalogBridge')
const {
  MAX_CONCURRENT_DOWNLOADS,
  MAX_DOWNLOAD_BYTES,
  MIN_FREE_BYTES_RESERVE,
  PROGRESS_THROTTLE_MS,
  downloadsRoot,
  FAMILY_DIRS,
  DOWNLOADABLE_TYPES,
} = require('./constants')
const {
  classifyDownloadability,
  assertDownloadableHttpsUrl,
  isLiveOrPlaylistUrl,
  userFacingError,
} = require('./downloadability')
const {
  identityKey,
  relativePathForItem,
  extensionFromContentType,
  assertInsideRoot,
  sanitizeSegment,
} = require('./pathSafety')
const {
  readStore,
  writeStoreAtomic,
  absoluteFromRelative,
  normalizeItem,
} = require('./metadataStore')

function nowIso() {
  return new Date().toISOString()
}

function makeDownloadId(type, id) {
  return `${type}__${sanitizeSegment(id, 'id')}`
}

function freeDiskBytes(dirPath) {
  try {
    if (typeof fs.statfsSync === 'function') {
      const stats = fs.statfsSync(dirPath)
      return Number(stats.bavail) * Number(stats.bsize)
    }
  } catch {
    // ignore
  }
  return null
}

function ensureTree(userDataPath) {
  const root = downloadsRoot(userDataPath)
  fs.mkdirSync(root, { recursive: true })
  fs.mkdirSync(path.join(root, 'partial'), { recursive: true })
  fs.mkdirSync(path.join(root, 'metadata'), { recursive: true })
  for (const dir of Object.values(FAMILY_DIRS)) {
    fs.mkdirSync(path.join(root, dir), { recursive: true })
  }
  return root
}

function publicItem(item) {
  if (!item) return null
  const copy = { ...item }
  // Never expose absolute paths or full remote URLs to renderer.
  delete copy._absolutePath
  delete copy._resolvedUrl
  return copy
}

class DownloadManager {
  /**
   * @param {{ getUserDataPath: () => string, broadcast: (event: string, payload: unknown) => void }} options
   */
  constructor(options) {
    this.getUserDataPath = options.getUserDataPath
    this.broadcast = options.broadcast
    this.activeControllers = new Map()
    this.queue = []
    this.running = 0
    this.lastProgressAt = new Map()
    this.reconcilePromise = null
  }

  userData() {
    return this.getUserDataPath()
  }

  load() {
    ensureTree(this.userData())
    return readStore(this.userData())
  }

  persist(store) {
    return writeStoreAtomic(this.userData(), store)
  }

  list() {
    return this.load().items.map(publicItem)
  }

  findByIdentity(type, id) {
    const key = identityKey(type, id)
    return this.load().items.find((item) => identityKey(item.type, item.id) === key) || null
  }

  findByDownloadId(downloadId) {
    return this.load().items.find((item) => item.downloadId === downloadId) || null
  }

  upsert(item) {
    const store = this.load()
    const key = identityKey(item.type, item.id)
    const next = normalizeItem(item)
    if (!next) throw new Error('Invalid download metadata.')
    const filtered = store.items.filter((entry) => identityKey(entry.type, entry.id) !== key)
    filtered.unshift(next)
    this.persist({ ...store, items: filtered })
    this.broadcast('downloads:updated', { item: publicItem(next) })
    return next
  }

  patch(downloadId, patch) {
    const store = this.load()
    const index = store.items.findIndex((item) => item.downloadId === downloadId)
    if (index < 0) return null
    const merged = normalizeItem({
      ...store.items[index],
      ...patch,
      updatedAt: nowIso(),
    })
    if (!merged) return null
    store.items[index] = merged
    this.persist(store)
    this.broadcast('downloads:updated', { item: publicItem(merged) })
    return merged
  }

  async resolveMediaUrl(request) {
    const type = request.type
    const id = String(request.id || '').trim()
    if (!DOWNLOADABLE_TYPES.has(type) || !id) {
      const err = new Error(userFacingError('unsupported'))
      err.code = 'unsupported'
      throw err
    }

    const policy = classifyDownloadability(type)
    if (policy !== 'downloadable') {
      const err = new Error(userFacingError(policy === 'stream_only' ? 'stream_only' : 'unsupported'))
      err.code = policy === 'stream_only' ? 'stream_only' : 'unsupported'
      throw err
    }

    // Test harness only: allow direct candidateUrl for any downloadable family.
    if (process.env.HT_DOWNLOADS_TEST_ALLOW_HTTP === '1') {
      const testCandidate = typeof request.candidateUrl === 'string' ? request.candidateUrl.trim() : ''
      if (
        testCandidate.startsWith('http://127.0.0.1')
        || testCandidate.startsWith('http://localhost')
        || testCandidate.startsWith('https://')
      ) {
        assertDownloadableHttpsUrl(testCandidate)
        return {
          url: testCandidate,
          duration: typeof request.duration === 'number' ? request.duration : null,
          mimeType: null,
        }
      }
    }

    if (type === 'podcast_episode') {
      const result = await fetchApprovedCatalog(`/api/podcasts/episodes/${encodeURIComponent(id)}/play`)
      const audioUrl = result?.payload?.audioUrl || result?.payload?.audio_url
      if (!result?.ok || typeof audioUrl !== 'string' || !audioUrl.startsWith('https://')) {
        const err = new Error(userFacingError('expired'))
        err.code = 'expired'
        throw err
      }
      return {
        url: audioUrl.trim(),
        duration: Number(result.payload.durationSeconds ?? result.payload.duration_seconds) || null,
        mimeType: null,
      }
    }

    if (type === 'audiobook_chapter') {
      const bookId = String(request.parentId || request.bookId || '').trim()
      const chapterId = String(request.chapterId || id).trim()
      if (!bookId) {
        const err = new Error(userFacingError('unsupported'))
        err.code = 'unsupported'
        throw err
      }
      const result = await fetchApprovedCatalog(
        `/api/audiobooks/${encodeURIComponent(bookId)}/chapters/play?from=${encodeURIComponent(chapterId)}`,
      )
      const chapters = Array.isArray(result?.payload?.chapters) ? result.payload.chapters : []
      const match = chapters.find((row) => String(row.id) === chapterId) || chapters[0]
      const audioUrl = match?.audioUrl || match?.audio_url
      if (!result?.ok || typeof audioUrl !== 'string' || !audioUrl.startsWith('https://')) {
        const err = new Error(userFacingError('expired'))
        err.code = 'expired'
        throw err
      }
      return {
        url: audioUrl.trim(),
        duration: Number(match.durationSeconds ?? match.duration_seconds) || null,
        mimeType: null,
      }
    }

    if (type === 'motivational') {
      const result = await fetchApprovedCatalog(`/api/motivation/items/${encodeURIComponent(id)}/play`)
      const playback = result?.payload?.playback || result?.payload || {}
      const mediaType = String(playback.mediaType || playback.media_type || result?.payload?.mediaType || '').toLowerCase()
      if (mediaType === 'stream' || mediaType === 'embed') {
        const err = new Error(userFacingError('stream_only'))
        err.code = 'stream_only'
        throw err
      }
      const audioUrl = playback.url || playback.audioUrl || playback.stream_url || result?.payload?.audioUrl
      if (!result?.ok || typeof audioUrl !== 'string' || !audioUrl.startsWith('https://')) {
        const err = new Error(userFacingError('expired'))
        err.code = 'expired'
        throw err
      }
      return {
        url: audioUrl.trim(),
        duration: Number(playback.durationSeconds ?? result?.payload?.durationSeconds) || null,
        mimeType: playback.mimeType || null,
      }
    }

    if (type === 'lecture') {
      const seriesId = String(request.parentId || request.seriesId || '').trim()
      const lessonId = String(request.chapterId || id).trim()
      if (!seriesId) {
        const err = new Error(userFacingError('unsupported'))
        err.code = 'unsupported'
        throw err
      }
      const result = await fetchApprovedCatalog(
        `/api/lectures/items/${encodeURIComponent(seriesId)}/play?lessonId=${encodeURIComponent(lessonId)}`,
      )
      const payload = result?.payload || {}
      const mediaType = String(payload.mediaType || payload.media_type || '').toLowerCase()
      if (mediaType === 'stream' || mediaType === 'embed') {
        const err = new Error(userFacingError('stream_only'))
        err.code = 'stream_only'
        throw err
      }
      const playbackUrl =
        payload.playbackUrl
        || payload.playback_url
        || payload.audioUrl
        || payload.audio_url
        || payload.url
      if (!result?.ok || typeof playbackUrl !== 'string' || !playbackUrl.startsWith('https://')) {
        const err = new Error(userFacingError('expired'))
        err.code = 'expired'
        throw err
      }
      return {
        url: playbackUrl.trim(),
        duration: Number(payload.durationSeconds ?? payload.duration_seconds) || null,
        mimeType: payload.mimeType || null,
      }
    }

    // song — candidateUrl must be provided (or retained in metadata) and pass host allowlist
    const fromRequest = typeof request.candidateUrl === 'string' ? request.candidateUrl.trim() : ''
    const fromMeta =
      request.metadata && typeof request.metadata.candidateUrl === 'string'
        ? request.metadata.candidateUrl.trim()
        : ''
    const candidate = fromRequest || fromMeta
    if (!candidate.startsWith('https://') && !(
      process.env.HT_DOWNLOADS_TEST_ALLOW_HTTP === '1'
      && (candidate.startsWith('http://127.0.0.1') || candidate.startsWith('http://localhost'))
    )) {
      const err = new Error(userFacingError('unsupported'))
      err.code = 'unsupported'
      throw err
    }
    assertDownloadableHttpsUrl(candidate)
    return {
      url: candidate,
      duration: typeof request.duration === 'number' ? request.duration : null,
      mimeType: null,
    }
  }

  async probe(url) {
    assertDownloadableHttpsUrl(url)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)
    try {
      let response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal })
      if (!response.ok || response.status === 405) {
        response = await fetch(url, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' },
          redirect: 'follow',
          signal: controller.signal,
        })
      }
      const finalUrl = response.url || url
      const contentType = response.headers.get('content-type')
      assertDownloadableHttpsUrl(finalUrl, contentType)
      if (isLiveOrPlaylistUrl(finalUrl, contentType)) {
        const err = new Error(userFacingError('stream_only'))
        err.code = 'stream_only'
        throw err
      }
      const lenHeader = response.headers.get('content-length')
      const contentRange = response.headers.get('content-range')
      let size = lenHeader ? Number(lenHeader) : null
      if ((!size || !Number.isFinite(size)) && contentRange) {
        const match = /\/(\d+)$/.exec(contentRange)
        if (match) size = Number(match[1])
      }
      if (size != null && Number.isFinite(size) && size > MAX_DOWNLOAD_BYTES) {
        const err = new Error(userFacingError('too_large'))
        err.code = 'too_large'
        throw err
      }
      // Unknown length continuous streams: reject when not a finite media type and no length
      if ((size == null || !Number.isFinite(size)) && String(contentType || '').includes('text/')) {
        const err = new Error(userFacingError('stream_only'))
        err.code = 'stream_only'
        throw err
      }
      const acceptRanges = String(response.headers.get('accept-ranges') || '').toLowerCase()
      const supportsRange = acceptRanges.includes('bytes') || Boolean(contentRange)
      return {
        finalUrl,
        contentType,
        size: Number.isFinite(size) ? size : null,
        supportsRange,
      }
    } catch (error) {
      if (error && error.code) throw error
      const err = new Error(userFacingError('invalid_response'))
      err.code = 'invalid_response'
      throw err
    } finally {
      clearTimeout(timeout)
    }
  }

  assertDiskBudget(expectedSize) {
    const root = ensureTree(this.userData())
    const free = freeDiskBytes(root)
    if (free == null) return
    const need = (expectedSize && expectedSize > 0 ? expectedSize : 8 * 1024 * 1024) + MIN_FREE_BYTES_RESERVE
    if (free < need) {
      const err = new Error(userFacingError('disk'))
      err.code = 'disk'
      throw err
    }
  }

  async start(request) {
    const type = String(request?.type || '').trim()
    const id = String(request?.id || '').trim()
    const title = String(request?.title || '').trim() || 'Download'
    if (!type || !id) {
      return { ok: false, errorCode: 'unsupported', errorMessage: userFacingError('unsupported') }
    }

    const policy = classifyDownloadability(type)
    if (policy !== 'downloadable') {
      return {
        ok: false,
        errorCode: policy === 'stream_only' ? 'stream_only' : 'unsupported',
        errorMessage: userFacingError(policy === 'stream_only' ? 'stream_only' : 'unsupported'),
      }
    }

    const existing = this.findByIdentity(type, id)
    if (existing && ['queued', 'resolving', 'downloading', 'paused'].includes(existing.status)) {
      return { ok: true, item: publicItem(existing), duplicate: true }
    }
    if (existing && existing.status === 'completed' && existing.localRelativePath) {
      try {
        const abs = absoluteFromRelative(this.userData(), existing.localRelativePath)
        if (fs.existsSync(abs) && fs.statSync(abs).size > 0) {
          return { ok: true, item: publicItem(existing), duplicate: true }
        }
      } catch {
        // fall through to re-download
      }
    }

    const downloadId = existing?.downloadId || makeDownloadId(type, id)
    const item = this.upsert({
      ...(existing || {}),
      id,
      type,
      title,
      downloadId,
      status: 'queued',
      createdAt: existing?.createdAt || nowIso(),
      updatedAt: nowIso(),
      subtitle: request.subtitle ?? existing?.subtitle ?? null,
      artwork: request.artwork ?? existing?.artwork ?? null,
      sourceId: id,
      parentId: request.parentId ?? request.bookId ?? request.seriesId ?? existing?.parentId ?? null,
      showId: request.showId ?? existing?.showId ?? null,
      bookId: request.bookId ?? existing?.bookId ?? null,
      seriesId: request.seriesId ?? existing?.seriesId ?? null,
      chapterId: request.chapterId ?? existing?.chapterId ?? null,
      localRelativePath: null,
      downloadedBytes: 0,
      fileSize: null,
      errorCode: null,
      errorMessage: null,
      retryCount: existing?.retryCount || 0,
      isMature: request.isMature === true,
      contentRating: request.contentRating ?? existing?.contentRating ?? null,
      duration: request.duration ?? existing?.duration ?? null,
      metadata: {
        ...(existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
        ...(request.metadata && typeof request.metadata === 'object' ? request.metadata : {}),
        ...(typeof request.candidateUrl === 'string' && request.candidateUrl.startsWith('https://')
          ? { candidateUrl: request.candidateUrl.trim() }
          : {}),
      },
    })

    this.queue.push({ downloadId, request: { ...request, type, id, title } })
    this.pump()
    return { ok: true, item: publicItem(item) }
  }

  pump() {
    while (this.running < MAX_CONCURRENT_DOWNLOADS && this.queue.length > 0) {
      const job = this.queue.shift()
      if (!job) break
      this.running += 1
      void this.runJob(job)
        .catch(() => {})
        .finally(() => {
          this.running -= 1
          this.pump()
        })
    }
  }

  async runJob(job) {
    const { downloadId, request } = job
    const controller = new AbortController()
    this.activeControllers.set(downloadId, controller)

    try {
      this.patch(downloadId, { status: 'resolving', errorCode: null, errorMessage: null })
      const resolved = await this.resolveMediaUrl(request)
      if (controller.signal.aborted) throw Object.assign(new Error(userFacingError('cancelled')), { code: 'cancelled' })

      const probe = await this.probe(resolved.url)
      this.assertDiskBudget(probe.size)

      const ext = extensionFromContentType(probe.contentType, new URL(probe.finalUrl).pathname)
      const relative = relativePathForItem(request.type, request.id, ext)
      // Keep partials under partial/ using identity-based names
      const partialName = `${sanitizeSegment(request.type)}_${sanitizeSegment(request.id)}.${ext}.part`
      const partialRelative = path.join('partial', partialName)
      const root = ensureTree(this.userData())
      const partialAbs = assertInsideRoot(root, path.join(root, partialRelative))
      const finalAbs = assertInsideRoot(root, path.join(root, relative))

      fs.mkdirSync(path.dirname(partialAbs), { recursive: true })
      fs.mkdirSync(path.dirname(finalAbs), { recursive: true })

      this.patch(downloadId, {
        status: 'downloading',
        localRelativePath: null,
        mimeType: probe.contentType,
        fileSize: probe.size,
        supportsRange: probe.supportsRange,
        remoteUrlIdentity: `${new URL(probe.finalUrl).hostname}${new URL(probe.finalUrl).pathname}`.slice(0, 240),
        duration: resolved.duration ?? request.duration ?? null,
      })

      await this.writeFile(probe.finalUrl, partialAbs, downloadId, controller.signal, probe)

      // Atomic finalize
      if (fs.existsSync(finalAbs)) fs.unlinkSync(finalAbs)
      fs.renameSync(partialAbs, finalAbs)
      const stats = fs.statSync(finalAbs)
      if (!stats.size) {
        fs.unlinkSync(finalAbs)
        throw Object.assign(new Error(userFacingError('invalid_response')), { code: 'invalid_response' })
      }

      this.patch(downloadId, {
        status: 'completed',
        localRelativePath: relative.replace(/\\/g, '/'),
        downloadedBytes: stats.size,
        fileSize: stats.size,
        errorCode: null,
        errorMessage: null,
      })
      this.broadcast('downloads:completed', { downloadId })
    } catch (error) {
      const code = error?.code || (controller.signal.aborted ? 'cancelled' : 'failed')
      if (code === 'cancelled') {
        this.patch(downloadId, {
          status: 'failed',
          errorCode: 'cancelled',
          errorMessage: userFacingError('cancelled'),
        })
      } else {
        this.patch(downloadId, {
          status: 'failed',
          errorCode: typeof code === 'string' ? code : 'failed',
          errorMessage: error?.message || userFacingError('failed'),
          retryCount: (this.findByDownloadId(downloadId)?.retryCount || 0) + 1,
        })
      }
      this.broadcast('downloads:failed', { downloadId, errorCode: code })
    } finally {
      this.activeControllers.delete(downloadId)
    }
  }

  async writeFile(url, partialAbs, downloadId, signal, probe) {
    const response = await fetch(url, { method: 'GET', redirect: 'follow', signal })
    if (!response.ok || !response.body) {
      throw Object.assign(new Error(userFacingError('invalid_response')), { code: 'invalid_response' })
    }
    const contentType = response.headers.get('content-type')
    if (isLiveOrPlaylistUrl(url, contentType)) {
      throw Object.assign(new Error(userFacingError('stream_only')), { code: 'stream_only' })
    }

    const nodeStream = Readable.fromWeb(response.body)
    const fileStream = createWriteStream(partialAbs)
    let downloaded = 0

    nodeStream.on('data', (chunk) => {
      downloaded += chunk.length
      if (downloaded > MAX_DOWNLOAD_BYTES) {
        nodeStream.destroy(Object.assign(new Error(userFacingError('too_large')), { code: 'too_large' }))
        return
      }
      this.emitProgress(downloadId, downloaded, probe.size && probe.size > 0 ? probe.size : MAX_DOWNLOAD_BYTES)
    })

    await pipeline(nodeStream, fileStream)
    this.patch(downloadId, { downloadedBytes: downloaded })
  }

  emitProgress(downloadId, downloadedBytes, totalBytes) {
    const now = Date.now()
    const last = this.lastProgressAt.get(downloadId) || 0
    if (now - last < PROGRESS_THROTTLE_MS && downloadedBytes < totalBytes) return
    this.lastProgressAt.set(downloadId, now)
    this.patch(downloadId, {
      status: 'downloading',
      downloadedBytes,
      fileSize: Number.isFinite(totalBytes) ? totalBytes : null,
    })
    this.broadcast('downloads:progress', {
      downloadId,
      downloadedBytes,
      totalBytes: Number.isFinite(totalBytes) ? totalBytes : null,
    })
  }

  cancel(downloadId) {
    const controller = this.activeControllers.get(downloadId)
    if (controller) controller.abort()
    this.queue = this.queue.filter((job) => job.downloadId !== downloadId)
    const item = this.findByDownloadId(downloadId)
    if (item && ['queued', 'resolving', 'downloading', 'paused'].includes(item.status)) {
      this.patch(downloadId, {
        status: 'failed',
        errorCode: 'cancelled',
        errorMessage: userFacingError('cancelled'),
      })
    }
    return { ok: true }
  }

  pause(downloadId) {
    // Full byte-range resume is deferred when unsupported; pause cancels active transfer.
    this.cancel(downloadId)
    this.patch(downloadId, {
      status: 'paused',
      errorCode: 'no_resume',
      errorMessage: userFacingError('no_resume'),
    })
    return { ok: true, resumable: false }
  }

  async resume(downloadId) {
    const item = this.findByDownloadId(downloadId)
    if (!item) return { ok: false, errorCode: 'missing', errorMessage: userFacingError('missing') }
    const candidateUrl =
      item.metadata && typeof item.metadata.candidateUrl === 'string'
        ? item.metadata.candidateUrl
        : undefined
    // Restart cleanly (byte-range resume deferred unless product-approved).
    return this.start({
      type: item.type,
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      artwork: item.artwork,
      parentId: item.parentId,
      showId: item.showId,
      bookId: item.bookId,
      seriesId: item.seriesId,
      chapterId: item.chapterId,
      duration: item.duration,
      isMature: item.isMature,
      contentRating: item.contentRating,
      metadata: item.metadata,
      candidateUrl,
    })
  }

  remove(downloadId) {
    const item = this.findByDownloadId(downloadId)
    if (!item) return { ok: true }
    this.cancel(downloadId)
    this.patch(downloadId, { status: 'removing' })

    const root = ensureTree(this.userData())
    if (item.localRelativePath) {
      try {
        const abs = absoluteFromRelative(this.userData(), item.localRelativePath)
        if (fs.existsSync(abs)) fs.unlinkSync(abs)
      } catch {
        // ignore
      }
    }
    // Clean matching partials
    try {
      const partialDir = path.join(root, 'partial')
      if (fs.existsSync(partialDir)) {
        for (const name of fs.readdirSync(partialDir)) {
          if (name.includes(sanitizeSegment(item.id))) {
            fs.unlinkSync(path.join(partialDir, name))
          }
        }
      }
    } catch {
      // ignore
    }

    const store = this.load()
    store.items = store.items.filter((entry) => entry.downloadId !== downloadId)
    this.persist(store)
    this.broadcast('downloads:removed', { downloadId, type: item.type, id: item.id })
    return { ok: true }
  }

  getPlayableUrl(downloadId) {
    const item = this.findByDownloadId(downloadId)
    if (!item || item.status !== 'completed' || !item.localRelativePath) {
      return { ok: false, errorCode: 'missing', errorMessage: userFacingError('missing') }
    }
    try {
      const abs = absoluteFromRelative(this.userData(), item.localRelativePath)
      if (!fs.existsSync(abs) || fs.statSync(abs).size <= 0) {
        this.patch(downloadId, { status: 'missing', errorCode: 'missing', errorMessage: userFacingError('missing') })
        return { ok: false, errorCode: 'missing', errorMessage: userFacingError('missing') }
      }
      const { PROTOCOL_SCHEME } = require('./constants')
      const encoded = item.localRelativePath.split(/[/\\]/).map(encodeURIComponent).join('/')
      return {
        ok: true,
        url: `${PROTOCOL_SCHEME}://media/${encoded}`,
        item: publicItem(item),
      }
    } catch {
      this.patch(downloadId, { status: 'invalid', errorCode: 'missing', errorMessage: userFacingError('missing') })
      return { ok: false, errorCode: 'missing', errorMessage: userFacingError('missing') }
    }
  }

  getDiskUsage() {
    const root = ensureTree(this.userData())
    let downloadsBytes = 0
    let partialBytes = 0

    const walk = (dir, bucket) => {
      if (!fs.existsSync(dir)) return
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === 'metadata') continue
          walk(full, entry.name === 'partial' ? 'partial' : bucket)
        } else if (entry.isFile()) {
          try {
            const size = fs.statSync(full).size
            if (bucket === 'partial' || entry.name.endsWith('.part')) partialBytes += size
            else downloadsBytes += size
          } catch {
            // ignore
          }
        }
      }
    }
    walk(root, 'downloads')
    return {
      downloadsBytes,
      partialBytes,
      freeBytes: freeDiskBytes(root),
      rootLabel: 'downloads',
      maxItemBytes: MAX_DOWNLOAD_BYTES,
      minFreeReserveBytes: MIN_FREE_BYTES_RESERVE,
      maxConcurrent: MAX_CONCURRENT_DOWNLOADS,
    }
  }

  reconcile() {
    if (this.reconcilePromise) return this.reconcilePromise
    this.reconcilePromise = Promise.resolve().then(() => {
      ensureTree(this.userData())
      const store = this.load()
      let changed = false
      const nextItems = store.items.map((item) => {
        if (item.status === 'completed') {
          if (!item.localRelativePath) {
            changed = true
            return { ...item, status: 'missing', errorCode: 'missing', errorMessage: userFacingError('missing'), updatedAt: nowIso() }
          }
          try {
            const abs = absoluteFromRelative(this.userData(), item.localRelativePath)
            if (!fs.existsSync(abs) || fs.statSync(abs).size <= 0) {
              changed = true
              return { ...item, status: 'missing', errorCode: 'missing', errorMessage: userFacingError('missing'), updatedAt: nowIso() }
            }
          } catch {
            changed = true
            return { ...item, status: 'invalid', errorCode: 'missing', errorMessage: userFacingError('missing'), updatedAt: nowIso() }
          }
        }
        if (['resolving', 'downloading'].includes(item.status)) {
          changed = true
          return {
            ...item,
            status: 'failed',
            errorCode: 'cancelled',
            errorMessage: 'The download was interrupted. Try again.',
            updatedAt: nowIso(),
          }
        }
        return item
      })

      // Dedupe by identity
      const seen = new Set()
      const deduped = []
      for (const item of nextItems) {
        const key = identityKey(item.type, item.id)
        if (seen.has(key)) {
          changed = true
          continue
        }
        seen.add(key)
        deduped.push(item)
      }

      if (changed) this.persist({ ...store, items: deduped })
      this.broadcast('downloads:reconciled', { count: deduped.length })
      return { ok: true, count: deduped.length }
    }).finally(() => {
      this.reconcilePromise = null
    })
    return this.reconcilePromise
  }
}

module.exports = {
  DownloadManager,
  makeDownloadId,
  freeDiskBytes,
}
