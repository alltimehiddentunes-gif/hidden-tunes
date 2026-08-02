import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'docs', 'audits', 'launch-readiness', 'tv-browse-functional-repair')
fs.mkdirSync(outDir, { recursive: true })
const port = Number(process.env.HT_CDP_PORT || 9555)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function findPage() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json())
      const page = pages.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl && !/devtools/i.test(entry.url))
      if (page) return page
    } catch { /* retry */ }
    await sleep(500)
  }
  throw new Error('Packaged Electron CDP page did not appear')
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    let id = 0
    const pending = new Map()
    socket.addEventListener('open', () => resolve({
      send(method, params = {}) {
        const messageId = ++id
        return new Promise((res, rej) => {
          pending.set(messageId, { res, rej })
          socket.send(JSON.stringify({ id: messageId, method, params }))
        })
      },
      close: () => socket.close(),
    }))
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (!pending.has(message.id)) return
      const { res, rej } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) rej(new Error(JSON.stringify(message.error)))
      else res(message.result)
    })
    socket.addEventListener('error', reject)
  })
}

async function main() {
  const page = await findPage()
  const cdp = await connect(page.webSocketDebuggerUrl)
  const evaluate = async (expression) => {
    const response = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'Evaluation failed')
    return response.result?.value
  }
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await sleep(2200)
  await evaluate(`(() => { const n=[...document.querySelectorAll('button,a')].find(x=>(x.textContent||'').trim()==='TV'); n?.click(); return !!n })()`)
  await sleep(4500)

  const browse = await evaluate(`(() => ({
    categories:[...(document.querySelector('#tv-browse-heading')?.closest('section')?.querySelectorAll('.tv-genre-card')||[])].map(x=>({label:x.querySelector('strong')?.textContent||'',count:x.querySelector('span:last-child')?.textContent||''})).slice(0,6),
    regions:[...document.querySelectorAll('.tv-region-card')].map(x=>({label:x.querySelector('strong')?.textContent||'',count:x.querySelector('span:last-child')?.textContent||''})),
    nav:document.querySelector('.page-view')?.dataset.nav||''
  }))()`)
  if (browse.nav !== 'tv' || browse.categories.length === 0 || browse.regions.length === 0) throw new Error(`TV browse cards unavailable: ${JSON.stringify(browse)}`)

  const checks = []
  for (const item of browse.categories) {
    const clicked = await evaluate(`(() => { const label=${JSON.stringify(item.label)}; const b=[...document.querySelectorAll('.tv-genre-card')].find(x=>(x.querySelector('strong')?.textContent||'')===label); b?.click(); return !!b })()`)
    await sleep(1400)
    const state = await evaluate(`(() => { const s=document.querySelector('#tv-catalog-heading')?.closest('section'); return {heading:document.querySelector('#tv-catalog-heading')?.textContent?.trim()||'',cards:s?.querySelectorAll('.tv-station-card:not(.tv-station-card--skeleton)').length||0,nav:document.querySelector('.page-view')?.dataset.nav||''} })()`)
    checks.push({ type: 'category', ...item, clicked, ...state })
  }
  for (const item of browse.regions) {
    const clicked = await evaluate(`(() => { const label=${JSON.stringify(item.label)}; const b=[...document.querySelectorAll('.tv-region-card')].find(x=>(x.querySelector('strong')?.textContent||'')===label); b?.click(); return !!b })()`)
    await sleep(1400)
    const state = await evaluate(`(() => { const s=document.querySelector('#tv-catalog-heading')?.closest('section'); return {heading:document.querySelector('#tv-catalog-heading')?.textContent?.trim()||'',cards:s?.querySelectorAll('.tv-station-card:not(.tv-station-card--skeleton)').length||0,nav:document.querySelector('.page-view')?.dataset.nav||''} })()`)
    checks.push({ type: 'region', ...item, clicked, ...state })
  }
  await evaluate(`(() => { const input=document.querySelector('input[type="search"],input[placeholder*="Search" i]'); if(input){const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,''); input.dispatchEvent(new Event('input',{bubbles:true})); input.closest('form')?.requestSubmit()} const b=[...document.querySelectorAll('.tv-genre-card')].find(x=>(x.querySelector('strong')?.textContent||'')==='News'); b?.click(); return !!b })()`)
  await sleep(1600)
  const initialNewsCount = await evaluate(`document.querySelector('#tv-catalog-heading')?.closest('section')?.querySelectorAll('.tv-station-card:not(.tv-station-card--skeleton)').length || 0`)
  await evaluate(`(() => { const b=document.querySelector('.tv-load-more-btn'); b?.click(); return !!b })()`)
  await sleep(3500)
  const loadedNewsCount = await evaluate(`document.querySelector('#tv-catalog-heading')?.closest('section')?.querySelectorAll('.tv-station-card:not(.tv-station-card--skeleton)').length || 0`)
  const filteredSearch = await evaluate(`(() => { const input=document.querySelector('input[type="search"],input[placeholder*="Search" i]'); if(!input)return false; const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,'BBC'); input.dispatchEvent(new Event('input',{bubbles:true})); input.closest('form')?.requestSubmit(); return true })()`)
  await sleep(1800)
  const searchState = await evaluate(`(() => { const s=document.querySelector('#tv-catalog-heading')?.closest('section'); return {heading:document.querySelector('#tv-catalog-heading')?.textContent?.trim()||'',cards:s?.querySelectorAll('.tv-station-card:not(.tv-station-card--skeleton)').length||0,nav:document.querySelector('.page-view')?.dataset.nav||''} })()`)
  const playClicked = await evaluate(`(() => { const s=document.querySelector('#tv-catalog-heading')?.closest('section'); const b=s?.querySelector('.tv-station-card-hit'); b?.click(); return !!b })()`)
  await sleep(1200)
  const playState = await evaluate(`(() => ({nav:document.querySelector('.page-view')?.dataset.nav||'',active:document.querySelector('.app-shell')?.dataset.hasActiveMedia||'',video:!!document.querySelector('.tv-video-surface, video')}))()`)
  const functional = {
    pagination: { initialNewsCount, loadedNewsCount, passed: loadedNewsCount > initialNewsCount },
    filteredSearch: { submitted: filteredSearch, ...searchState, passed: filteredSearch && searchState.nav === 'tv' && searchState.heading === 'News' && searchState.cards > 0 },
    playback: { clicked: playClicked, ...playState, passed: playClicked && playState.nav === 'tv' && (playState.active === 'true' || playState.video) },
  }
  const failed = checks.filter((entry) => !entry.clicked || entry.nav !== 'tv' || entry.cards < 1 || !entry.heading.includes(entry.label))
  if (!functional.pagination.passed) failed.push({ type: 'pagination', ...functional.pagination })
  if (!functional.filteredSearch.passed) failed.push({ type: 'filtered-search', ...functional.filteredSearch })
  if (!functional.playback.passed) failed.push({ type: 'playback', ...functional.playback })
  const result = { url: page.url, browse, checks, functional, failed, passed: checks.length + 3 - failed.length }
  fs.writeFileSync(path.join(outDir, 'packaged-runtime.json'), JSON.stringify(result, null, 2))
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs.writeFileSync(path.join(outDir, 'packaged-tv-filtered.png'), Buffer.from(shot.data, 'base64'))
  cdp.close()
  console.log(`${failed.length ? 'FAIL' : 'PASS'}: TV browse ${result.passed}/${checks.length + 3}`, JSON.stringify(failed))
  if (failed.length) process.exit(1)
}

main().catch((error) => { console.error(error); process.exit(1) })
