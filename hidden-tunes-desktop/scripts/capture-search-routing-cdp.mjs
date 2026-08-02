import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'docs', 'audits', 'launch-readiness', 'search-routing-repair', 'screenshots')
fs.mkdirSync(outDir, { recursive: true })
const port = Number(process.env.HT_CDP_PORT || 9444)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function findPage() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json())
      const page = pages.find((item) => item.type === 'page' && item.webSocketDebuggerUrl && !/devtools/i.test(item.url))
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
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Evaluation failed')
    return result.result?.value
  }
  const capture = async (name, width, height) => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await sleep(700)
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(path.join(outDir, name), Buffer.from(shot.data, 'base64'))
  }
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await sleep(2500)
  const opened = await evaluate(`(() => { const n=[...document.querySelectorAll('button,a')].find(x=>(x.textContent||'').trim()==='Search'); n?.click(); return !!n })()`)
  if (!opened) throw new Error('Search navigation missing')
  await sleep(900)
  const typed = await evaluate(`(() => { const i=document.querySelector('input[type="search"],input[placeholder*="Search" i]'); if(!i)return false; const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(i,'BBC'); i.dispatchEvent(new Event('input',{bubbles:true})); return true })()`)
  if (!typed) throw new Error('Search input missing')
  await sleep(5000)
  const state = await evaluate(`(() => ({nav:document.querySelector('.page-view')?.dataset.nav||'',tv:document.querySelectorAll('#search-tv-heading').length,radio:document.querySelectorAll('#search-radio-heading').length,play:[...document.querySelectorAll('.psd-search-result-play')].map(x=>x.getAttribute('aria-label')),rows:document.querySelectorAll('.ht-global-search-section .psd-search-side-row').length,url:location.href,center:[...document.elementsFromPoint(innerWidth*.6,innerHeight*.65)].slice(0,6).map(x=>{const r=x.getBoundingClientRect(),s=getComputedStyle(x);return {tag:x.tagName,cls:x.className,id:x.id,rect:[r.x,r.y,r.width,r.height],position:s.position,parent:x.parentElement?.className}})}))()`)
  fs.writeFileSync(path.join(outDir, 'runtime-state.json'), JSON.stringify(state, null, 2))
  await capture('search-bbc-1024x768.png', 1024, 768)
  await capture('search-bbc-1440x900.png', 1440, 900)
  await capture('search-bbc-1920x1080.png', 1920, 1080)
  if (state.nav !== 'search' || state.rows < 1) throw new Error(`Search results did not render: ${JSON.stringify(state)}`)
  const tvBody = await evaluate(`(() => { const section=document.querySelector('#search-tv-heading')?.closest('section'); const b=section?.querySelector('.psd-search-result-body'); b?.click(); return !!b })()`)
  await sleep(800)
  const tvDestination = await evaluate(`document.querySelector('.page-view')?.dataset.nav || ''`)
  if (!tvBody || tvDestination !== 'tv') throw new Error(`TV card routed to ${tvDestination || 'nothing'}`)
  await evaluate(`(() => { const n=[...document.querySelectorAll('button,a')].find(x=>(x.textContent||'').trim()==='Search'); n?.click(); return !!n })()`)
  await sleep(900)
  await evaluate(`(() => { const i=document.querySelector('input[type="search"],input[placeholder*="Search" i]'); const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(i,'BBC'); i.dispatchEvent(new Event('input',{bubbles:true})); return true })()`)
  await sleep(4000)
  const tvPlay = await evaluate(`(() => { const section=document.querySelector('#search-tv-heading')?.closest('section'); const b=section?.querySelector('.psd-search-result-play'); b?.click(); return !!b })()`)
  await sleep(1000)
  const afterPlay = await evaluate(`document.querySelector('.page-view')?.dataset.nav || ''`)
  if (!tvPlay || afterPlay !== 'search') throw new Error(`TV Play changed route to ${afterPlay || 'nothing'}`)
  const finalState = { ...state, tvDestination, tvPlayStayedOnSearch: afterPlay === 'search' }
  fs.writeFileSync(path.join(outDir, 'runtime-state.json'), JSON.stringify(finalState, null, 2))
  console.log('PASS: packaged Search renderer', JSON.stringify(finalState))
  cdp.close()
}

main().catch((error) => { console.error(error); process.exit(1) })
