#!/usr/bin/env node
/** Phase 3K — full-screen player transition verification */
import { chromium } from 'playwright'

const BASE = process.env.HT_VERIFY_URL ?? 'http://127.0.0.1:5173'

const SHELLS = {
  'player-1': '[aria-label="Fullscreen player"]',
  'player-2': '[aria-label="Player 2 theater"]',
  'player-3': '[aria-label="Player 3 VIP theater"]',
  'player-4': '[aria-label="Player 4 VIP theater"]',
  'player-5': '[aria-label="Player 5 VIP theater"]',
}

const LABELS = {
  'player-1': 'Classic Vinyl',
  'player-2': 'Premium PSD Player',
  'player-3': 'Cinematic Waveform',
  'player-4': 'Theater Mode',
  'player-5': 'Ambient World Player',
}

const CLOSE_SELECTORS = [
  '[aria-label="Exit fullscreen player"]',
  '[aria-label="Exit Player 2"]',
  '[aria-label="Exit Player 3"]',
  '[aria-label="Exit Player 4"]',
  '[aria-label="Exit Player 5"]',
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

async function overlaySnapshot(page) {
  return page.evaluate((shellSelectors) => {
    const root = document.documentElement
    let visibleStyle = null
    let shellCount = 0
    for (const [style, selector] of Object.entries(shellSelectors)) {
      if (document.querySelector(selector)) {
        shellCount += 1
        visibleStyle = style
      }
    }
    const shell = document.querySelector('.premium-player-overlay')
    return {
      shellCount,
      visibleStyle,
      overlayPhase: shell?.getAttribute('data-overlay-phase') ?? null,
      docPhase: root.dataset.htPlayerOverlayPhase ?? null,
      docOpen: root.dataset.htPlayerOverlay ?? null,
      footerHidden: !document.querySelector('.player-bar')
        || getComputedStyle(document.querySelector('.player-bar')).visibility === 'hidden',
    }
  }, SHELLS)
}

async function ensurePlayerBarReady(page) {
  const shellOpen = await page.evaluate(() => Boolean(document.querySelector('.premium-player-overlay')))
  if (shellOpen) {
    await closePlayer(page)
    await page.waitForTimeout(400)
  }
  await page.waitForSelector('.player-bar .player-mode-launcher--footer .player-mode-launcher-trigger', {
    timeout: 25_000,
  })
}

async function openFromLauncher(page, variant, label) {
  const launcher = page.locator(`.player-mode-launcher--${variant} .player-mode-launcher-trigger`)
  await launcher.click({ force: true })
  await page.locator('.player-mode-launcher-item').filter({ hasText: label }).click()
  await page.waitForTimeout(400)
}

async function closePlayer(page) {
  for (const selector of CLOSE_SELECTORS) {
    const target = page.locator(selector).first()
    if (await target.count()) {
      await target.click({ force: true })
      break
    }
  }
  await page.waitForFunction(
    () => !document.querySelector('.premium-player-overlay'),
    { timeout: 3000 },
  )
}

async function switchInPlayer(page, label) {
  await page.locator('.player-mode-switcher-trigger').click({ force: true })
  await page.locator('.player-mode-switcher-item').filter({ hasText: label }).click()
  await page.waitForTimeout(260)
}

async function assertAudioContinuous(before, after, step) {
  if (!before.exists || !after.exists) {
    throw new Error(`${step}: audio element missing`)
  }
  if (after.paused && !before.paused) {
    throw new Error(`${step}: playback paused unexpectedly`)
  }
  if (after.error != null) {
    throw new Error(`${step}: audio error ${after.error}`)
  }
  if (before.src && after.src && before.src !== after.src) {
    throw new Error(`${step}: audio source changed unexpectedly`)
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  })
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  const results = []

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.waitForTimeout(12_000)
    await startPlayback(page)
    await page.waitForTimeout(1500)
    await ensurePlayerBarReady(page)

    const audioBaseline = await audioSnapshot(page)

    const footerBefore = await audioSnapshot(page)
    await openFromLauncher(page, 'footer', LABELS['player-1'])
    const footerOverlay = await overlaySnapshot(page)
    const footerAfter = await audioSnapshot(page)
    assertAudioContinuous(footerBefore, footerAfter, 'footer-open')
    if (footerOverlay.shellCount !== 1) {
      throw new Error(`footer-open: expected 1 shell, got ${footerOverlay.shellCount}`)
    }
    if (footerOverlay.visibleStyle !== 'player-1') {
      throw new Error(`footer-open: expected player-1, got ${footerOverlay.visibleStyle}`)
    }
    results.push({ step: 'footer-open', ok: true, overlay: footerOverlay })

    const closeBefore = await audioSnapshot(page)
    await closePlayer(page)
    const closeOverlay = await overlaySnapshot(page)
    const closeAfter = await audioSnapshot(page)
    assertAudioContinuous(closeBefore, closeAfter, 'close')
    if (closeOverlay.shellCount !== 0) {
      throw new Error(`close: shell still visible (${closeOverlay.shellCount})`)
    }
    results.push({ step: 'close', ok: true, overlay: closeOverlay })

    const sidebarBefore = await audioSnapshot(page)
    await openFromLauncher(page, 'sidebar', LABELS['player-2'])
    const sidebarOverlay = await overlaySnapshot(page)
    const sidebarAfter = await audioSnapshot(page)
    assertAudioContinuous(sidebarBefore, sidebarAfter, 'sidebar-open')
    if (sidebarOverlay.visibleStyle !== 'player-2') {
      throw new Error(`sidebar-open: expected player-2, got ${sidebarOverlay.visibleStyle}`)
    }
    results.push({ step: 'sidebar-open', ok: true, overlay: sidebarOverlay })

    const switches = []
    for (const style of ['player-3', 'player-4', 'player-5', 'player-1', 'player-2']) {
      const before = await audioSnapshot(page)
      await switchInPlayer(page, LABELS[style])
      const overlay = await overlaySnapshot(page)
      const after = await audioSnapshot(page)
      assertAudioContinuous(before, after, `switch-${style}`)
      if (overlay.shellCount !== 1) {
        throw new Error(`switch-${style}: duplicate shell count ${overlay.shellCount}`)
      }
      if (overlay.visibleStyle !== style) {
        throw new Error(`switch-${style}: visible ${overlay.visibleStyle}`)
      }
      switches.push({ style, overlayPhase: overlay.overlayPhase, ok: true })
    }
    results.push({ step: 'player-switch', ok: true, switches })

    const trackBefore = await audioSnapshot(page)
    if (trackBefore.exists && !trackBefore.paused && trackBefore.error == null) {
      await page.locator('.premium-player-overlay [aria-label="Next track"]').first().click({ force: true })
      await page.waitForTimeout(2200)
    }
    const trackOverlay = await overlaySnapshot(page)
    const trackAfter = await audioSnapshot(page)
    if (trackOverlay.shellCount !== 1) {
      throw new Error(`track-change: shell count ${trackOverlay.shellCount}`)
    }
    if (!trackAfter.exists) {
      throw new Error('track-change: audio element missing')
    }
    results.push({
      step: 'track-change',
      ok: true,
      method: 'next',
      srcChanged: trackBefore.src !== trackAfter.src,
      overlay: trackOverlay,
    })

    await closePlayer(page)
    const finalAudio = await audioSnapshot(page)
    if (!finalAudio.exists) {
      throw new Error('final: audio element missing')
    }

    console.log(JSON.stringify({ ok: true, results }, null, 2))
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error), results }, null, 2))
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main()
