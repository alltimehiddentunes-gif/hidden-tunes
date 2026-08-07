import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const app = read('src/App.tsx')
const provider = read('src/context/DesktopPlaybackProvider.tsx')
const audio = read('src/lib/desktopPlayback/HtmlAudioPlaybackService.ts')
const video = read('src/lib/tv/HtmlVideoPlaybackService.ts')
const videoPanel = read('src/components/tv/TvNowPlayingPanel.tsx')
const fullScreenShell = read('src/components/player/PremiumFullscreenShell.tsx')
const appCss = read('src/App.css')

let failed = 0
function check(label, condition) {
  if (condition) console.log(`PASS: ${label}`)
  else {
    failed += 1
    console.error(`FAIL: ${label}`)
  }
}

check('one canonical renderer media-session boundary', app.includes('const startMediaSession = useCallback'))
check('music starts compact canonical session', app.includes('const selectAndPlay = useCallback') && !app.includes('presentationIntent:'))
check('legacy song workspace is no longer entered by playback', !app.includes('openSong(track)'))
check('radio enters canonical session', /startMediaSession\(\{[\s\S]{0,180}context: 'radio'/.test(app))
check('podcast enters canonical session', /startMediaSession\(\{[\s\S]{0,180}context: 'podcast'/.test(app))
check('audiobook enters canonical session', /startMediaSession\(\{[\s\S]{0,180}context: 'audiobook'/.test(app))
check('motivational enters canonical session', /startMediaSession\(\{[\s\S]{0,180}context: 'motivational'/.test(app))
check('lecture enters canonical session', /startMediaSession\(\{[\s\S]{0,180}context: 'lecture'/.test(app))
check('TV enters canonical session', /startMediaSession\(\{[\s\S]{0,180}context: 'tv'/.test(app))
check('TV expanded presentation is absent', !app.includes('isExpandedVideoSession') && !app.includes('videoPresentation={isExpandedVideoSession'))
check('compact TV has no Expand entry point', !videoPanel.includes('onExpand') && !videoPanel.includes('Open video Now Playing'))
check('canonical shell does not inject TV video', !fullScreenShell.includes("adapter.kind === 'tv' && videoPresentation"))
check('PiP remains on the shared video service', videoPanel.includes('requestPictureInPicture') && videoPanel.includes('acquireTvVideoPlaybackService'))
check('fullscreen remains explicit', videoPanel.includes('requestFullscreen'))
check('TV surface cannot flex-compress its control bar', /\.tv-video-surface\s*\{[\s\S]*?flex:\s*0 0 auto;/.test(appCss))
check('TV controls remain visible below the clipped video viewport', /\.tv-video-surface-mount\s*\{[\s\S]*?overflow:\s*hidden;/.test(appCss) && /\.tv-video-surface-toolbar\s*\{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?min-height:\s*42px;/.test(appCss))
check('single audio constructor', (audio.match(/new Audio\(/g) ?? []).length === 1)
check('provider owns audio and video mutex', provider.includes("activeMediaRef = useRef<'audio' | 'video'>") && provider.includes('stopInactiveMedia'))
check('video service parks one element across presentations', video.includes('unmount') && !video.includes('new Video('))

console.log(`Media-session contract: ${19 - failed} passed, ${failed} failed`)
if (failed) process.exit(1)
