#!/usr/bin/env node
/** Phase 3I — full-screen player visualizer validation */
import { chromium } from 'playwright'

const BASE = process.env.HT_VERIFY_URL ?? 'http://127.0.0.1:5177'
const PLAYERS = [
  {
    style: 'player-1',
    shell: '[aria-label="Fullscreen player"]',
    label: 'Classic Vinyl',
    waveform: '.psd-player-waveform--master[data-premium-waveform="rail"]',
  },
  {
    style: 'player-2',
    shell: '[aria-label="Player 2 theater"]',
    label: 'Premium PSD Player',
    waveform: '.player2-waveform[data-premium-waveform="rail"]',
  },
  {
    style: 'player-3',
    shell: '[aria-label="Player 3 VIP theater"]',
    label: 'Cinematic Waveform',
    waveform: '.player3-waveform[data-premium-waveform="rail"]',
  },
  {
    style: 'player-4',
    shell: '[aria-label="Player 4 VIP theater"]',
    label: 'Theater Mode',
    waveform: '.player4-waveform[data-premium-waveform="rail"]',
  },
  {
    style: 'player-5',
    shell: '[aria-label="Player 5 VIP theater"]',
    label: 'Ambient World Player',
    waveform: '.player5-waveform[data-premium-waveform="rail"]',
  },
]

async function navSidebar(page, label) {
  await page.evaluate((navLabel) => {
    [...document.querySelectorAll('nav[aria-label="Main navigation"] button')]
      .find((btn) => btn.textContent?.trim() === navLabel)?.click()
  }, label)
  await page.waitForTimeout(900)
}

async function startPlayback(page) {
  await navSidebar(page, 'Artists')
  await page.locator('.psd-artist-btn--play').first().click()
  await page.waitForFunction(
    () => Boolean(document.querySelector('[aria-label="Playback controls"] button[aria-label="Pause"]')),
    { timeout: 25_000 },
  )
}

async function openPlayer(page, label) {
  const visible = await page.evaluate(() =>
    Boolean(document.querySelector('[aria-label="Fullscreen player"]')
      || document.querySelector('[aria-label^="Player "]')),
  )
  if (visible) {
    await page.locator('.player-mode-switcher-trigger').click({ force: true })
    await page.locator('.player-mode-switcher-item').filter({ hasText: label }).click()
  } else {
    await page.locator('.player-mode-launcher-trigger').first().click({ force: true })
    await page.locator('.player-mode-launcher-item').filter({ hasText: label }).click()
  }
  await page.waitForTimeout(900)
}

async function auditWaveform(page, selector) {
  return page.evaluate((waveformSelector) => {
    const el = document.querySelector(waveformSelector)
    if (!el) return { found: false }
    const bars = el.querySelectorAll('.rail-waveform-bar, span')
    const scales = [...bars].slice(0, 8).map((bar) =>
      getComputedStyle(bar).getPropertyValue('--ht-bar-scale').trim() || 'none',
    )
    return {
      found: true,
      barCount: bars.length,
      idle: el.getAttribute('data-ht-waveform-idle'),
      sampleScales: scales,
      rootFallback: document.documentElement.dataset.htAudioFallback ?? null,
      rootReactive: document.documentElement.dataset.htAudioReactive ?? null,
    }
  }, selector)
}

async function ensurePlaying(page, shell) {
  const playing = await page.evaluate(() => {
    const audio = document.querySelector('audio[data-ht-playback="true"]')
    return audio instanceof HTMLAudioElement && !audio.paused
  })
  if (playing) return

  await page.evaluate((shellSelector) => {
    const root = document.querySelector(shellSelector)
    const playBtn = root?.querySelector(
      '[aria-label="Playback controls"] button[aria-label="Play"],'
      + ' [aria-label="Playback controls"] button.psd-player-transport-btn--play',
    )
    playBtn?.click()
  }, shell)

  await page.waitForFunction(
    () => {
      const audio = document.querySelector('audio[data-ht-playback="true"]')
      return audio instanceof HTMLAudioElement && !audio.paused
    },
    { timeout: 12_000 },
  ).catch(() => undefined)
}

async function toggleTransport(page, shell, action) {
  await page.evaluate(({ shellSelector, action }) => {
    const root = document.querySelector(shellSelector)
    if (!root) return
    const selector = action === 'pause'
      ? '[aria-label="Playback controls"] button[aria-label="Pause"]'
      : '[aria-label="Playback controls"] button[aria-label="Play"]'
    const btn = root.querySelector(selector)
      ?? root.querySelector('[aria-label="Playback controls"] button.psd-player-transport-btn--play')
    btn?.click()
  }, { shellSelector: shell, action })
}

async function audioSnapshot(page) {
  return page.evaluate(() => {
    const audio = document.querySelector('audio[data-ht-playback="true"]')
    if (!audio) return { exists: false }
    return {
      exists: true,
      paused: audio.paused,
      src: audio.currentSrc || audio.src,
      currentTime: audio.currentTime,
      error: audio.error?.code ?? null,
    }
  })
}

async function main() {
  const consoleErrors = []
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  })
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (text.includes('CORS policy') || text.includes('net::ERR_FAILED')) return
    consoleErrors.push(text)
  })
  page.on('pageerror', (error) => {
    consoleErrors.push(error.message)
  })

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.waitForTimeout(10_000)
    await startPlayback(page)
    await page.waitForTimeout(1500)
    const firstTrackSrc = (await audioSnapshot(page)).src

    const playerResults = []
    for (const player of PLAYERS) {
      await openPlayer(page, player.label)
      await page.waitForSelector(player.shell, { timeout: 8000 })
      await ensurePlaying(page, player.shell)
      await page.waitForTimeout(600)
      const playing = await auditWaveform(page, player.waveform)

      await toggleTransport(page, player.shell, 'pause')
      await page.waitForFunction(
        () => {
          const audio = document.querySelector('audio[data-ht-playback="true"]')
          return audio instanceof HTMLAudioElement && audio.paused
        },
        { timeout: 8000 },
      ).catch(() => undefined)
      await page.waitForTimeout(400)
      const paused = await audioSnapshot(page)
      const pausedWaveform = await auditWaveform(page, player.waveform)

      await toggleTransport(page, player.shell, 'play')
      await page.waitForFunction(
        () => {
          const audio = document.querySelector('audio[data-ht-playback="true"]')
          return audio instanceof HTMLAudioElement && !audio.paused
        },
        { timeout: 8000 },
      ).catch(() => undefined)
      await page.waitForTimeout(400)

      playerResults.push({
        ...player,
        playing,
        pausedWaveform,
        pauseWorked: paused.paused === true,
      })
    }

    const soundBeforeTrackChange = await audioSnapshot(page)

    await page.evaluate(() => {
      const shell = document.querySelector('[aria-label="Player 5 VIP theater"]')
      const next = shell?.querySelectorAll('.psd-player-transport-btn--skip')[1]
      next?.click()
    })
    await page.waitForTimeout(2200)
    let afterTrackChange = await audioSnapshot(page)
    const trackChanged = Boolean(
      afterTrackChange.src && firstTrackSrc && afterTrackChange.src !== firstTrackSrc,
    )

    await ensurePlaying(page, PLAYERS[4].shell)
    const sound = await audioSnapshot(page)
    const ok =
      playerResults.every(({ playing }) => playing.found && playing.barCount > 0)
      && playerResults.every(({ playing }) => playing.idle === 'false')
      && playerResults.every(({ pauseWorked }) => pauseWorked)
      && trackChanged
      && soundBeforeTrackChange.exists
      && !soundBeforeTrackChange.paused
      && Boolean(soundBeforeTrackChange.src)
      && soundBeforeTrackChange.error == null
      && consoleErrors.length === 0

    console.log(JSON.stringify({
      ok,
      playerResults,
      firstTrackSrc,
      afterTrackChange,
      trackChanged,
      soundBeforeTrackChange,
      sound,
      consoleErrors,
    }, null, 2))
    process.exit(ok ? 0 : 1)
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error), consoleErrors }, null, 2))
    process.exit(1)
  } finally {
    await browser.close()
  }
}

main()
