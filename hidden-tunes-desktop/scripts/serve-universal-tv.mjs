import { appendFileSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { normalizeTvArtworkUrl, tvArtworkHash, TV_ARTWORK_ORIGIN } from './tv-artwork-key.mjs'

const root = fileURLToPath(new URL('../dist-tv/', import.meta.url))
const entry = join(root, 'tv.html')
const portFlag = process.argv.indexOf('--port')
const hostFlag = process.argv.indexOf('--host')
const port = portFlag >= 0 ? Number(process.argv[portFlag + 1]) : 4173
const host = hostFlag >= 0 ? process.argv[hostFlag + 1] : '0.0.0.0'
const artworkOrigin = TV_ARTWORK_ORIGIN
const artworkMaxBytes = 8 * 1024 * 1024
const evidenceDir = 'D:\\HiddenTunes\\Evidence\\Universal-TV-20260814'
const artworkLog = join(evidenceDir, 'vidaa-artwork-proxy.log')
mkdirSync(evidenceDir, { recursive: true })
const types = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' }

if (!existsSync(entry)) throw new Error('dist-tv/tv.html is missing. Build Universal TV first.')
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port.')

function logArtwork(pathname, method, status, duration, contentType, bytes, state) {
  appendFileSync(artworkLog, `${new Date().toISOString()} artwork path=${pathname} method=${method} status=${status} type=${contentType || '-'} bytes=${bytes} duration=${duration}ms state=${state}\n`, 'utf8')
}

function convertForVidaa(bytes, maxEdge = 720) {
  return new Promise((resolve, reject) => {
    const process = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-map_metadata', '-1', '-vf', `scale='min(${maxEdge},iw)':-2,format=yuvj420p`, '-frames:v', '1', '-c:v', 'mjpeg', '-q:v', '6', '-f', 'image2pipe', 'pipe:1'], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
    const chunks = []
    let length = 0
    const timer = setTimeout(() => { process.kill(); reject(new Error('convert-timeout')) }, 8000)
    process.stdout.on('data', (chunk) => {
      length += chunk.length
      if (length > 3 * 1024 * 1024) { process.kill(); reject(new Error('convert-size-rejected')); return }
      chunks.push(chunk)
    })
    process.on('error', reject)
    process.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve(Buffer.concat(chunks, length)) : reject(new Error('convert-failed')) })
    process.stdin.end(bytes)
  })
}

async function readBoundedBody(upstream) {
  if (!upstream.body) return Buffer.alloc(0)
  const reader = upstream.body.getReader()
  const chunks = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > artworkMaxBytes) throw new Error('size-rejected')
      chunks.push(Buffer.from(value))
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  }
  return Buffer.concat(chunks, length)
}

const staticArtwork = new Map()
const artworkSourceByHash = new Map()
const artworkMetaByHash = new Map()
const derivativeByHash = new Map()
const MAX_ARTWORK_SOURCES = 48
const MAX_DERIVATIVES = 24

function touchBounded(map, key, value, limit) {
  map.delete(key); map.set(key, value)
  while (map.size > limit) map.delete(map.keys().next().value)
}

async function getStaticArtwork(name) {
  if (staticArtwork.has(name)) return staticArtwork.get(name)
  let source
  if (name === 'fallback.jpg') {
    source = readFileSync(join(root, 'brand', 'hidden-tunes-official.png'))
  } else throw new Error('static-name-rejected')
  const result = await convertForVidaa(source, 384)
  staticArtwork.set(name, result)
  return result
}

async function getArtworkDerivative(hash) {
  if (derivativeByHash.has(hash)) {
    const cached = derivativeByHash.get(hash); touchBounded(derivativeByHash, hash, cached, MAX_DERIVATIVES); return cached
  }
  const artworkUrl = artworkSourceByHash.get(hash)
  if (!artworkUrl || tvArtworkHash(artworkUrl) !== hash) throw new Error('derivative-unregistered')
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    const upstream = await fetch(artworkUrl, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { Accept: 'image/avif,image/webp,image/jpeg,image/png,image/gif' } })
    if (!upstream.ok || upstream.status >= 300) throw new Error(`derivative-upstream-${upstream.status}`)
    const contentType = (upstream.headers.get('content-type') || '').split(';')[0].toLowerCase()
    if (!['image/avif', 'image/webp', 'image/jpeg', 'image/png', 'image/gif'].includes(contentType)) throw new Error('derivative-content-type')
    const declaredLength = Number(upstream.headers.get('content-length') || 0)
    if (declaredLength > artworkMaxBytes) throw new Error('size-rejected')
    const derivative = await convertForVidaa(await readBoundedBody(upstream), 720)
    touchBounded(derivativeByHash, hash, derivative, MAX_DERIVATIVES)
    return derivative
  } finally { clearTimeout(timeout) }
}

createServer(async (request, response) => {
  const started = Date.now()
  const requestUrl = new URL(request.url ?? '/', 'http://tv.local')
  const pathname = decodeURIComponent(requestUrl.pathname)
  if (pathname === '/__tv_diag') {
    const allowed = ['event', 'kind', 'keyCode', 'selected', 'owner', 'before', 'after', 'width', 'height', 'asset'].map((key) => `${key}=${String(requestUrl.searchParams.get(key) || '').replace(/[^A-Za-z0-9_. -]/g, '').slice(0, 48)}`).join(' ')
    appendFileSync(artworkLog, `${new Date().toISOString()} hisense ${allowed}\n`, 'utf8')
    response.writeHead(204, { 'Cache-Control': 'no-store' }); response.end(); return
  }
  if (pathname.startsWith('/__tv_catalog/api/')) {
    const method = request.method || 'GET'
    const upstreamPath = pathname.slice('/__tv_catalog'.length)
    const musicCatalog = /^\/api\/(songs|albums|artists)(\/|$)/.test(upstreamPath)
    const allowed = musicCatalog || /^\/api\/(radio|tv|podcasts|audiobooks|motivation|lectures)(\/|$)/.test(upstreamPath)
    if (method !== 'GET' || !allowed) {
      response.writeHead(method === 'GET' ? 404 : 405, { Allow: 'GET', 'Cache-Control': 'no-store' })
      response.end(); return
    }
    const upstreamUrl = new URL(upstreamPath, musicCatalog ? 'https://api.hiddentunes.com' : 'https://admin.hiddentunes.com')
    requestUrl.searchParams.forEach((value, key) => upstreamUrl.searchParams.set(key, key === 'limit' ? String(Math.min(6, Math.max(1, Number(value) || 6))) : value))
    if (!upstreamUrl.searchParams.has('limit') && /\/(stations|channels|shows|books|programs|series)$/.test(upstreamPath)) upstreamUrl.searchParams.set('limit', '6')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    try {
      const upstream = await fetch(upstreamUrl, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { Accept: 'application/json', 'x-ht-platform': 'tv', 'x-ht-storefront-country': 'ZZ' } })
      const contentType = (upstream.headers.get('content-type') || '').split(';')[0].toLowerCase()
      if (!upstream.ok || contentType !== 'application/json') throw new Error(`upstream-${upstream.status}-${contentType || 'missing-type'}`)
      const declared = Number(upstream.headers.get('content-length') || 0)
      if (declared > 4 * 1024 * 1024) throw new Error('catalog-size-rejected')
      const bytes = Buffer.from(await upstream.arrayBuffer())
      if (bytes.length > 4 * 1024 * 1024) throw new Error('catalog-size-rejected')
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': bytes.length, 'Cache-Control': 'private, max-age=30', 'X-Content-Type-Options': 'nosniff' })
      response.end(bytes)
      appendFileSync(artworkLog, `${new Date().toISOString()} catalog path=${upstreamPath} status=200 type=application/json bytes=${bytes.length} state=complete\n`, 'utf8')
    } catch (error) {
      const state = error instanceof Error ? error.message.replace(/\s+/g, '-').slice(0, 80) : 'catalog-error'
      response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify({ error: 'Catalog temporarily unavailable. Retry.' }))
      appendFileSync(artworkLog, `${new Date().toISOString()} catalog path=${upstreamPath} status=502 type=application/json bytes=0 state=${state}\n`, 'utf8')
    } finally { clearTimeout(timeout) }
    return
  }
  if (pathname === '/__tv_art/register') {
    const method = request.method || 'GET'
    const normalized = normalizeTvArtworkUrl(requestUrl.searchParams.get('src'))
    if (method !== 'GET' || !normalized) {
      response.writeHead(method === 'GET' ? 400 : 405, { Allow: 'GET', 'Cache-Control': 'no-store' }); response.end(); return
    }
    const hash = tvArtworkHash(normalized)
    const mediaId = String(requestUrl.searchParams.get('media') || 'unknown').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || 'unknown'
    const field = String(requestUrl.searchParams.get('field') || 'unknown').replace(/[^A-Za-z0-9_]/g, '').slice(0, 32) || 'unknown'
    touchBounded(artworkSourceByHash, hash, normalized, MAX_ARTWORK_SOURCES)
    touchBounded(artworkMetaByHash, hash, { mediaId, field }, MAX_ARTWORK_SOURCES)
    const body = Buffer.from(JSON.stringify({ artworkUrl: normalized, derivativeUrl: `/__tv_art/${hash}.jpg` }))
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    response.end(body)
    logArtwork(`/__tv_art/${hash}.jpg`, method, 200, Date.now() - started, 'application/json', body.length, `registered-field-${field}-media-${mediaId}`)
    return
  }
  const derivativeMatch = pathname.match(/^\/__tv_art\/([a-f0-9]{24})\.jpg$/)
  if (derivativeMatch) {
    const method = request.method || 'GET'; const hash = derivativeMatch[1]
    const metadata = artworkMetaByHash.get(hash) || { mediaId: 'unknown', field: 'unknown' }
    if (method !== 'GET' && method !== 'HEAD') { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return }
    try {
      const bytes = await getArtworkDerivative(hash)
      let completed = false
      response.once('finish', () => { completed = true; logArtwork(pathname, method, 200, Date.now() - started, 'image/jpeg', method === 'HEAD' ? 0 : bytes.length, `complete-hashed-baseline-rgb-field-${metadata.field}-media-${metadata.mediaId}`) })
      response.once('close', () => { if (!completed) logArtwork(pathname, method, 200, Date.now() - started, 'image/jpeg', 0, `abort-field-${metadata.field}-media-${metadata.mediaId}`) })
      response.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': bytes.length, 'Content-Encoding': 'identity', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' })
      response.end(method === 'HEAD' ? undefined : bytes)
    } catch (error) {
      const state = error instanceof Error ? error.message : 'derivative-error'
      const status = state.includes('upstream-404') ? 404 : (state.includes('abort') || state.includes('timeout')) ? 503 : 502
      response.writeHead(status, { 'Cache-Control': 'no-store', ...(status === 503 ? { 'Retry-After': '1' } : {}) }); response.end()
      logArtwork(pathname, method, status, Date.now() - started, '', 0, `${state}-field-${metadata.field}-media-${metadata.mediaId}`)
    }
    return
  }
  if (pathname === '/__tv_art/fallback.jpg') {
    const method = request.method || 'GET'
    const name = pathname.slice('/__tv_art/'.length)
    if (method !== 'GET' && method !== 'HEAD') { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return }
    try {
      const bytes = await getStaticArtwork(name)
      response.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': bytes.length, 'Content-Encoding': 'identity', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' })
      response.end(method === 'HEAD' ? undefined : bytes)
      logArtwork(pathname, method, 200, Date.now() - started, 'image/jpeg', bytes.length, 'complete-static-baseline-rgb')
    } catch (error) {
      response.writeHead(502, { 'Cache-Control': 'no-store' }); response.end()
      logArtwork(pathname, method, 502, Date.now() - started, '', 0, error instanceof Error ? error.message : 'static-error')
    }
    return
  }
  if (pathname.startsWith('/__tv_artwork/')) {
    const method = request.method || 'GET'
    const artworkPath = pathname.slice('/__tv_artwork'.length)
    const validPath = (/^\/covers\/[A-Za-z0-9._%()+,@ -]+$/.test(artworkPath) || /^\/artists\/[A-Za-z0-9._%()+,@ /-]+$/.test(artworkPath))
      && !artworkPath.includes('..') && !artworkPath.includes('\\')
    if ((method !== 'GET' && method !== 'HEAD') || !validPath) {
      response.writeHead(method === 'GET' || method === 'HEAD' ? 400 : 405, { Allow: 'GET, HEAD' })
      response.end()
      logArtwork(artworkPath.slice(0, 240), method, response.statusCode, Date.now() - started, '', 0, 'rejected')
      return
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    try {
      const upstream = await fetch(`${artworkOrigin}${artworkPath}`, { method, redirect: 'manual', signal: controller.signal, headers: { Accept: 'image/avif,image/webp,image/jpeg,image/png,image/gif' } })
      clearTimeout(timeout)
      if (upstream.status >= 300 && upstream.status < 400) throw new Error('redirect-rejected')
      if (!upstream.ok) {
        response.writeHead(upstream.status, { 'Cache-Control': 'no-store' }); response.end()
        logArtwork(artworkPath, method, upstream.status, Date.now() - started, '', 0, 'upstream-status')
        return
      }
      const contentType = (upstream.headers.get('content-type') || '').split(';')[0].toLowerCase()
      if (!['image/avif', 'image/webp', 'image/jpeg', 'image/png', 'image/gif'].includes(contentType)) throw new Error('content-type-rejected')
      const declaredLength = Number(upstream.headers.get('content-length') || 0)
      if (declaredLength > artworkMaxBytes) throw new Error('size-rejected')
      const sourceBytes = method === 'HEAD' ? null : await readBoundedBody(upstream)
      const compatibility = requestUrl.searchParams.get('compat') === '1'
      const bytes = sourceBytes && compatibility ? await convertForVidaa(sourceBytes) : sourceBytes
      const responseType = compatibility ? 'image/jpeg' : contentType
      response.statusCode = upstream.status
      response.setHeader('Content-Type', responseType)
      response.setHeader('X-Content-Type-Options', 'nosniff')
      response.setHeader('Cache-Control', 'private, max-age=86400')
      if (bytes) response.setHeader('Content-Length', bytes.length)
      for (const name of ['etag', 'last-modified']) { const value = upstream.headers.get(name); if (value) response.setHeader(name, value) }
      response.end(bytes ?? undefined)
      logArtwork(artworkPath, method, upstream.status, Date.now() - started, responseType, bytes?.length || declaredLength, compatibility ? 'complete-baseline-jpeg' : 'complete-original')
    } catch (error) {
      clearTimeout(timeout)
      const category = error instanceof Error ? error.message.replace(/\s+/g, '-').slice(0, 80) : 'network-error'
      response.writeHead(category === 'size-rejected' ? 413 : 502, { 'Cache-Control': 'no-store' }); response.end()
      logArtwork(artworkPath, method, response.statusCode, Date.now() - started, '', 0, category.includes('abort') ? 'abort' : category)
    }
    return
  }
  const relative = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '')
  const candidate = join(root, relative)
  const file = candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile() ? candidate : entry
  const hashed = /[/\\]assets[/\\].+-[A-Za-z0-9_-]{8,}\./.test(file)
  response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream')
  response.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  if (/[/\\]assets[/\\]tv-[A-Za-z0-9_-]+\.js$/.test(file)) response.once('finish', () => appendFileSync(artworkLog, `${new Date().toISOString()} asset path=/assets/${file.split(/[/\\]/).pop()} status=200 bytes=${statSync(file).size} state=complete\n`, 'utf8'))
  createReadStream(file).pipe(response)
}).listen(port, host, () => {
  console.log(`Hidden Tunes Universal TV listening on http://${host}:${port}`)
})
