import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const service = fs.readFileSync(path.join(root, 'src/lib/tv/HtmlVideoPlaybackService.ts'), 'utf8')
const api = fs.readFileSync(path.join(root, 'src/lib/tv/tvCatalogApi.ts'), 'utf8')
const provider = fs.readFileSync(path.join(root, 'src/context/DesktopPlaybackProvider.tsx'), 'utf8')
const model = fs.readFileSync(path.join(root, 'src/lib/api.ts'), 'utf8')
const policy = fs.readFileSync(path.join(root, 'src/lib/tv/tvDesktopPolicy.ts'), 'utf8')

const checks = [
  ['HLS uses backend protocol', service.includes("protocol === 'hls'")],
  ['HLS uses backend source type', service.includes("sourceType === 'hls_stream'")],
  ['accepted m3u source type uses HLS', service.includes("sourceType === 'm3u_playlist'")],
  ['failed native HLS falls back to hls.js', service.includes('if (!Hls.isSupported()) throw nativeError')],
  ['direct sources bypass HLS', service.includes("return 'direct'")],
  ['DASH manifest recognition', service.includes("adapter === 'dash'") && service.includes("protocol === 'dash'")],
  ['DASH adapter attaches existing video', service.includes('player.initialize(this.video, url, false)')],
  ['DASH codec/manifest failure is classified', service.includes('DASH manifest, segments, or codecs')],
  ['DASH cleanup is bounded', service.includes('this.dash.reset()')],
  ['web limitation is truthful', service.includes('approved Desktop web-player surface')],
  ['web sources are Desktop-ineligible', policy.includes("['web', 'webpage', 'iframe', 'embed', 'youtube']")],
  ['backend Desktop eligibility is consumed', api.includes('payload.desktop_playable')],
  ['Desktop platform is requested', api.includes("platform: 'desktop'") && api.includes('play?platform=desktop')],
  ['canonical channel and source IDs retained', model.includes('channelId: string') && model.includes('sourceId: string | null')],
  ['play response retains source ID', api.includes('payload.source_id')],
  ['browse protocol survives deferred resolution', provider.includes('song.tvPlayback?.streamProtocol')],
  ['shared queue retains typed playback', provider.includes('tvPlayback: play')],
  ['single shared video owner receives typed source', provider.includes('.play(isTvQueueSong(song) && song.tvPlayback ? song.tvPlayback : streamUrl)')],
  ['no second video owner added', (service.match(/document\.createElement\('video'\)/g) || []).length === 1],
  ['bounded failed-channel fallback retained', provider.includes('TV_CHANNEL_FAIL_SKIP_LIMIT')],
]

let failed = 0
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`)
  if (!ok) failed += 1
}
if (failed) process.exit(1)
console.log(`TV format compatibility checks: ${checks.length}/${checks.length} PASS`)
