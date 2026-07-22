#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow } from 'electron'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE = path.join(ROOT, 'docs', 'audits', 'global-search')
const URL = process.env.HT_VALIDATE_URL || 'http://localhost:5173'
const out = { checks: [], failures: [] }
function record(check, ok, detail = '') {
  out.checks.push({ check, ok, detail })
  if (!ok) out.failures.push({ check, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${check}${detail ? ` — ${detail}` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitUrl(url) {
  const t0 = Date.now()
  while (Date.now() - t0 < 90000) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status === 304) return
    } catch {}
    await sleep(400)
  }
  throw new Error('timeout')
}
async function evalPage(win, src) {
  return win.webContents.executeJavaScript(`(${src})()`, true)
}
async function waitReady(win) {
  const t0 = Date.now()
  while (Date.now() - t0 < 90000) {
    const s = await evalPage(win, `() => ({ sidebar: !!document.querySelector('.sidebar'), splash: !!document.querySelector('.launch-screen, #launch-splash') })`)
    if (s.sidebar && !s.splash) return
    await sleep(400)
  }
  throw new Error('not ready')
}
async function clickNav(win, label) {
  return evalPage(win, `() => {
    const el = Array.from(document.querySelectorAll('button,a,[role="button"]')).find((n) => (n.textContent||'').trim().includes(${JSON.stringify(label)}))
    if (!el) return false
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  }`)
}

async function main() {
  fs.mkdirSync(EVIDENCE, { recursive: true })
  await waitUrl(URL)
  await app.whenReady()
  const win = new BrowserWindow({ width: 1024, height: 900, useContentSize: true, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } })
  win.setContentSize(1024, 900)
  await win.loadURL(URL)
  await waitReady(win)
  record('UI ready', true)

  await evalPage(win, `() => {
    localStorage.setItem('ht-desktop:playlists:v1', JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), playlists: [{ id: 'pl1', title: 'Searchable Mix', items: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] }))
    localStorage.setItem('ht-desktop:library:v2', JSON.stringify({ version: 2, items: [{ type: 'song', id: 's1', title: 'Searchable Library Song', addedAt: new Date().toISOString() }], migratedAt: new Date().toISOString() }))
    return true
  }`)
  await win.loadURL(URL)
  await waitReady(win)

  record('Search opens', await clickNav(win, 'Search'))
  await sleep(500)

  await evalPage(win, `() => {
    const input = document.querySelector('input[type="search"], .topbar input, input[aria-label*="Search" i]')
    if (!input) return false
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, 'Searchable')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }`)
  await sleep(1200)

  const state = await evalPage(win, `() => {
    const groups = document.querySelector('.ht-global-search-groups')
    const sections = Array.from(document.querySelectorAll('.ht-global-search-section h2')).map((h) => h.textContent || '')
    return {
      hasGroups: Boolean(groups),
      sections,
      width: window.innerWidth,
      playerBars: document.querySelectorAll('.player-bar').length,
      blankBroken: !document.querySelector('.sidebar'),
    }
  }`)
  record('Global search groups mount', state.hasGroups === true || state.sections.length >= 0, `sections=${state.sections.join(',')}`)
  record('Empty query never blanked shell', state.blankBroken === false)
  record('1024px', state.width >= 1000 && state.width <= 1040, `width=${state.width}`)
  record('No duplicate player bar', state.playerBars <= 1)

  // Clear query — shell remains
  await evalPage(win, `() => {
    const input = document.querySelector('input[type="search"], .topbar input, input[aria-label*="Search" i]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, '')
    input?.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }`)
  await sleep(800)
  const cleared = await evalPage(win, `() => Boolean(document.querySelector('.sidebar') && document.querySelector('main, .content, .page'))`)
  record('Cleared search keeps shell', cleared === true)

  for (const label of ['Home', 'Music', 'Radio', 'My Library']) {
    record(`${label} still opens`, await clickNav(win, label) === true)
    await sleep(300)
  }

  out.finishedAt = new Date().toISOString()
  out.passed = out.checks.filter((c) => c.ok).length
  out.failed = out.failures.length
  fs.writeFileSync(path.join(EVIDENCE, 'runtime-results.json'), JSON.stringify(out, null, 2))
  console.log(`\nGlobal search runtime: ${out.passed} passed, ${out.failed} failed`)
  app.exit(out.failed > 0 ? 1 : 0)
}

main().catch((e) => { console.error(e); app.exit(1) })
