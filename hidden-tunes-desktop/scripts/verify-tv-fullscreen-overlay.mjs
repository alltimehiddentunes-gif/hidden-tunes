import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const surface = readFileSync(new URL('../src/components/tv/TvVideoSurface.tsx', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/components/tv/TvNowPlayingPanel.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')

assert.match(surface, /document\.addEventListener\('fullscreenchange'/, 'fullscreen state must follow the platform event')
assert.match(surface, /window\.setTimeout\([\s\S]*3000\)/, 'controls must use one three-second inactivity timer')
assert.match(surface, /data-controls-visible=/, 'controls must hide through presentation state')
assert.match(surface, /onPointerMove=\{handlePointerActivity\}/, 'pointer movement must reveal controls')
assert.match(surface, /onKeyDown=\{handleKeyDown\}/, 'keyboard and remote input must reveal controls')
assert.match(surface, /onTouchStart=\{handlePointerActivity\}/, 'touch input must reveal controls')
assert.match(surface, /!lastInputWasPointerRef\.current && surface\?\.contains\(document\.activeElement\)/, 'pointer focus must not prevent timed hiding')
assert.match(panel, /setCssFullscreenActive\(true\)/, 'a CSS fullscreen fallback must exist')
assert.match(panel, /await surface\.requestFullscreen\(\)/, 'the common video-and-controls root must be the Fullscreen API target')
assert.doesNotMatch(panel, /video\.requestFullscreen\(\)/, 'the video element must never become the isolated Fullscreen API target')
assert.match(surface, /data-fullscreen-root="true"/, 'the common fullscreen root must be explicit')
assert.match(surface, /data-video-layer="true"/, 'the fullscreen video layer must be explicit')
assert.match(surface, /data-controls-overlay="true"/, 'the fullscreen controls overlay must be explicit')
assert.match(css, /\.tv-video-surface\.is-css-fullscreen[\s\S]*position: fixed;[\s\S]*inset: 0;/, 'fallback must own the viewport')
assert.match(css, /\.tv-video-surface:fullscreen \.tv-video-surface-mount[\s\S]*position: absolute;[\s\S]*height: 100%;/, 'video mount must fill fullscreen')
assert.match(css, /\.tv-video-surface:fullscreen \.ht-tv-video-element[\s\S]*position: absolute;[\s\S]*height: 100% !important;/, 'the mounted video element must fill its viewport layer')
assert.match(css, /\.tv-video-surface:fullscreen \.tv-video-surface-toolbar[\s\S]*position: absolute;[\s\S]*bottom: 0;/, 'controls must overlay the video')
assert.doesNotMatch(css, /\.tv-video-surface:fullscreen \.tv-video-surface-mount[\s\S]{0,240}calc\(100% - 56px\)/, 'fullscreen must not reserve a control row')

console.log('TV fullscreen overlay contract: PASS')
