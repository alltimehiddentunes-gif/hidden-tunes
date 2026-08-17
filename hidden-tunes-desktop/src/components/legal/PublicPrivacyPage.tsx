import { useEffect, useState } from 'react'
import { PRIVACY_POLICY_META, PRIVACY_POLICY_SECTIONS } from '../../legal/privacyPolicyContent'
import './PublicPrivacyPage.css'

type PrivacyNavKey = 'home' | 'about' | 'download' | 'music' | 'contact'

type PublicPrivacyPageProps = {
  onNavigate: (navKey: PrivacyNavKey) => void
}

export function PublicPrivacyPage({ onNavigate }: PublicPrivacyPageProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    document.title = 'Privacy Policy · Hidden Tunes'
    const staticPolicy = document.getElementById('ht-privacy-static')
    if (staticPolicy) staticPolicy.setAttribute('hidden', '')
  }, [])

  useEffect(() => {
    if (!menuOpen) return undefined
    const previous = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    addEventListener('keydown', close)
    return () => {
      document.documentElement.style.overflow = previous
      removeEventListener('keydown', close)
    }
  }, [menuOpen])

  const go = (key: PrivacyNavKey) => {
    setMenuOpen(false)
    onNavigate(key)
  }

  return (
    <div className="ht-privacy-page" data-web-information-route="privacy">
      <header className="ht-privacy-header">
        <button className="ht-privacy-logo" type="button" onClick={() => go('home')} aria-label="Hidden Tunes home">
          <img src="/brand/hidden-tunes-official.png" alt="" />
          <span>Hidden Tunes</span>
        </button>
        <button
          className="ht-privacy-menu"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="privacy-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
          <b className="sr-only">Menu</b>
        </button>
        <nav id="privacy-navigation" className={menuOpen ? 'is-open' : ''} aria-label="Public website">
          <button type="button" onClick={() => go('home')}>Home</button>
          <button type="button" onClick={() => go('about')}>About</button>
          <button type="button" onClick={() => go('download')}>Download</button>
          <button type="button" onClick={() => go('contact')}>Contact</button>
          <a className="is-active" href="/privacy" aria-current="page">Privacy</a>
          <button className="ht-privacy-start" type="button" onClick={() => go('music')}>Open Hidden Tunes</button>
        </nav>
      </header>

      <main className="ht-privacy-main">
        <article className="ht-privacy-article" aria-labelledby="privacy-title">
          <p className="ht-privacy-kicker">Legal</p>
          <h1 id="privacy-title">Privacy Policy</h1>
          <p className="ht-privacy-meta">
            Hidden Tunes · Android package {PRIVACY_POLICY_META.packageId} · Effective {PRIVACY_POLICY_META.effectiveDate}
          </p>
          {PRIVACY_POLICY_SECTIONS.map((section) => (
            <section key={section.id} id={section.id}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
          <p className="ht-privacy-contact">
            Privacy contact: {PRIVACY_POLICY_META.contactEmail}
          </p>
        </article>
      </main>
    </div>
  )
}
