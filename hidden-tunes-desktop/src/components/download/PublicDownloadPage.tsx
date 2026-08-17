import { useEffect, useState } from 'react'
import './PublicDownloadPage.css'

type DownloadNavKey = 'home' | 'about' | 'download' | 'music' | 'worlds' | 'originals' | 'contact' | 'search'
type Props = { onNavigate: (key: DownloadNavKey) => void }

declare global {
  interface Window { HiddenTunesWeb?: { install?: () => Promise<boolean> } }
}

const unavailable = (label: string) => <span className="ht-download-unavailable" aria-disabled="true"><b>{label}</b><small>Coming Soon</small></span>

export function PublicDownloadPage({ onNavigate }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [qrOpen, setQrOpen] = useState(false)
  const [installReady, setInstallReady] = useState(false)

  useEffect(() => {
    const ready = () => setInstallReady(true)
    addEventListener('hidden-tunes-install-ready', ready)
    return () => removeEventListener('hidden-tunes-install-ready', ready)
  }, [])

  const go = (key: DownloadNavKey) => { setMenuOpen(false); onNavigate(key) }
  const features = () => { history.replaceState(history.state, '', '/about#features'); go('about') }
  const choose = () => document.getElementById('downloads')?.scrollIntoView({ behavior: 'smooth' })
  const share = async () => {
    const url = 'https://hiddentunes.com/download'
    try {
      if (navigator.share) await navigator.share({ title: 'Download Hidden Tunes', text: 'Hidden Tunes on every screen.', url })
      else { await navigator.clipboard.writeText(url); setNotice('Download link copied') }
    } catch (error) { if ((error as DOMException)?.name !== 'AbortError') setNotice('Copy https://hiddentunes.com/download') }
  }
  const install = async () => {
    if (installReady && await window.HiddenTunesWeb?.install?.()) setNotice('Hidden Tunes installed')
    else setNotice(/iphone|ipad|ipod/i.test(navigator.userAgent) ? 'In Safari, tap Share, then Add to Home Screen.' : 'Use your browser menu and choose Install app or Add to Home screen.')
  }

  return <div className="ht-download-page" data-web-information-route="download">
    <header className="ht-download-header">
      <button className="ht-download-logo" onClick={() => go('home')} aria-label="Hidden Tunes home"><img src="/brand/hidden-tunes-official.png" alt=""/><span>Hidden Tunes</span></button>
      <button className="ht-download-menu" aria-expanded={menuOpen} aria-controls="download-navigation" onClick={() => setMenuOpen(v => !v)}><span/><span/><span/><b className="sr-only">Menu</b></button>
      <nav id="download-navigation" className={menuOpen ? 'is-open' : ''} aria-label="Public website">
        <button onClick={() => go('home')}>Home</button><button onClick={() => go('about')}>About</button><button onClick={features}>Features</button><button onClick={() => go('worlds')}>Worlds</button><button onClick={() => go('originals')}>Originals</button><button className="is-active" aria-current="page">Download</button><button onClick={() => go('contact')}>Contact</button><button className="ht-download-search" aria-label="Search" onClick={() => go('search')}>⌕</button><button className="ht-download-start" onClick={() => go('music')}>Get Started</button>
      </nav>
    </header>

    <main>
      <section className="ht-download-hero" aria-labelledby="download-title">
        <div><h1 id="download-title">Hidden Tunes.<br/>Everywhere <em>You Are.</em></h1><p>One world of music, radio, podcasts, TV, sports and emotional entertainment — across every screen.</p><div className="ht-download-actions"><button onClick={choose}>Choose Your Device <span>›</span></button><button onClick={() => go('music')}>Open Web Player <span>▷</span></button></div></div>
      </section>

      <section id="downloads" className="ht-download-section" aria-labelledby="downloads-title"><h2 id="downloads-title">Download Hidden Tunes</h2>
        <div className="ht-download-grid">
          <article><header><i>1</i><span>▯</span><div><h3>Mobile</h3><p>iPhone, iPad &amp; Android</p></div></header><div className="ht-download-controls">{unavailable('Download on the App Store')}{unavailable('Get it on Google Play')}{unavailable('Download APK')}<button onClick={() => setQrOpen(true)}>▦ <span>Scan to Download</span></button></div><img className="ht-download-qr" src="/download-assets/download-qr.png" alt="QR code linking to https://hiddentunes.com/download"/></article>
          <article><header><i>2</i><span>▰</span><div><h3>Desktop</h3><p>Windows &amp; macOS</p></div></header><div className="ht-download-controls">{unavailable('Download for Windows')}{unavailable('Download for Mac')}{unavailable('Microsoft Store')}</div><p className="ht-download-note">Signed public installers are being prepared.</p></article>
          <article><header><i>3</i><span>◎</span><div><h3>Web App</h3><p>No installation required</p></div></header><div className="ht-download-controls"><button onClick={() => go('music')}>▷ <span>Open Web Player</span></button><button onClick={install}>⊞ <span>Install as Web App</span></button></div><p className="ht-download-note">Works in modern browsers. Installation options vary by device.</p></article>
          <article><header><i>4</i><span>▣</span><div><h3>Smart TV</h3><p>Big-screen entertainment</p></div></header><div className="ht-download-platforms">{['Samsung TV','LG TV','Android TV','Amazon Fire TV'].map(x => <span key={x}>{x}<small>Coming Soon</small></span>)}</div></article>
          <article><header><i>5</i><span>▱</span><div><h3>In Your Car</h3><p>Music and radio on the road</p></div></header><div className="ht-download-platforms"><span>Apple CarPlay<small>Mobile integration</small></span><span>Android Auto<small>Mobile integration</small></span></div><p className="ht-download-note">Works through the compatible Hidden Tunes mobile app.</p></article>
          <article><header><i>6</i><span>⇩</span><div><h3>Other Ways to Install</h3><p>Direct and alternative access</p></div></header><div className="ht-download-controls"><button onClick={() => setQrOpen(true)}>▦ <span>Scan QR Code</span></button><button onClick={share}>🔗 <span>Send Download Link</span></button>{unavailable('All Releases')}</div></article>
        </div>
      </section>

      <section className="ht-download-section ht-download-versions"><h2>Choose the Right Version</h2><div>{[
        ['▯','Mobile',['On-the-go listening','Personalized experience','Car integrations through mobile']],
        ['▰','Desktop',['Full desktop experience','Device-local downloads','Background playback','Keyboard shortcuts']],
        ['▣','TV',['Big-screen entertainment','Remote-friendly controls','Live TV playback']],
        ['◎','Web',['Instant access anywhere','No installation needed','Account access','Always current']],
      ].map(([icon,title,items]) => <article key={title as string}><span>{icon as string}</span><h3>{title as string}</h3><ul>{(items as string[]).map(item => <li key={item}>{item}</li>)}</ul></article>)}</div></section>

      <section className="ht-download-section ht-download-security"><div className="ht-download-shield">◇</div><div><h2>Official. Secure. Always Up to Date.</h2><div className="ht-download-benefits"><article><b>Verified destinations</b><p>Links are published only after an official destination is available.</p></article><article><b>Current Web experience</b><p>The Web app receives the latest deployed improvements.</p></article><article><b>One Hidden Tunes account</b><p>Use the same account wherever supported.</p></article></div></div></section>
      <section className="ht-download-final"><h2>Your world is ready.</h2><div className="ht-download-actions"><button onClick={choose}>Download Hidden Tunes ↓</button><button onClick={() => go('music')}>Open Web Player ▷</button></div></section>
    </main>

    <footer className="ht-download-footer"><div><strong>Hidden Tunes</strong><p>Entertainment that understands how you feel.</p></div><nav aria-label="Platform"><b>Platform</b><button onClick={choose}>Mobile</button><button onClick={choose}>Desktop</button><button onClick={() => go('music')}>Web Player</button></nav><nav aria-label="Company"><b>Company</b><button onClick={() => go('about')}>About Us</button><button onClick={() => go('contact')}>Contact</button><button onClick={() => go('originals')}>Originals</button></nav><nav aria-label="Explore"><b>Explore</b><button onClick={() => go('worlds')}>Emotional Worlds</button><button onClick={() => go('search')}>Search</button><button onClick={() => go('music')}>Listen</button></nav><small>© 2026 Hidden Tunes. All rights reserved.</small></footer>
    {notice && <div className="ht-download-toast" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
    {qrOpen && <div className="ht-download-modal" role="dialog" aria-modal="true" aria-labelledby="qr-title" onClick={() => setQrOpen(false)}><div onClick={e => e.stopPropagation()}><button className="ht-download-modal-close" onClick={() => setQrOpen(false)} aria-label="Close">×</button><h2 id="qr-title">Scan to open Hidden Tunes</h2><img src="/download-assets/download-qr.png" alt="QR code for https://hiddentunes.com/download"/><p>https://hiddentunes.com/download</p></div></div>}
  </div>
}
