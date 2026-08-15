import { useEffect, useState } from 'react'
import './PublicAboutPage.css'

type AboutNavKey =
  | 'home' | 'about' | 'music' | 'radio' | 'podcasts' | 'audiobooks'
  | 'tv' | 'sports' | 'lectures' | 'motivationals' | 'worlds'
  | 'originals' | 'contact' | 'search'

type PublicAboutPageProps = { onNavigate: (navKey: AboutNavKey) => void }

const mediaCards = [
  ['♫', 'Music', 'Millions of songs for every mood.', 'music'],
  ['◎', 'Global Radio', 'Live stations from every corner.', 'radio'],
  ['◉', 'Podcasts', 'Stories, conversations and insights.', 'podcasts'],
  ['▤', 'Audiobooks', 'Listen to books that inspire you.', 'audiobooks'],
  ['▣', 'Live TV', 'News, shows and entertainment.', 'tv'],
  ['◌', 'Sports', 'Live action. Anywhere, anytime.', 'sports'],
  ['◇', 'Lectures', "Learn from the world's best.", 'lectures'],
  ['☆', 'Motivationals', 'Fuel your mind. Lift your soul.', 'motivationals'],
  ['≈', 'Emotional Worlds', 'Ambient worlds crafted for how you feel.', 'worlds'],
  ['∿', 'Hidden Tunes Originals', 'Original music with meaning and soul.', 'originals'],
] as const

const worlds = [
  ['Healing', 'Rest. Recover. Restore.', '/artwork/worlds/emotional-world-calm.png', 'calm'],
  ['Peace', 'Find stillness within.', '/artwork/worlds/emotional-world-chill.png', 'calm'],
  ['Heartbreak', 'Feel it. Heal it. Let it go.', '/artwork/worlds/emotional-world-melancholy.png', 'melancholy'],
  ['Focus', 'Deep work. No distractions.', '/artwork/worlds/emotional-world-energetic.png', 'energetic'],
  ['Confidence', 'Rise. Believe. Own your power.', '/artwork/worlds/emotional-world-motivational.png', 'motivational'],
  ['Nostalgia', 'Memories that never fade.', '/artwork/worlds/emotional-world-romantic.png', 'romantic'],
  ['Renewal', 'New day. New you.', '/artwork/worlds/emotional-world-happy.png', 'happy'],
] as const

const devices = [
  ['▯', 'Mobile', 'iOS & Android'], ['▰', 'Web', 'Listen in your browser'],
  ['▱', 'Desktop', 'Windows & Mac'], ['▣', 'Smart TV', 'Big screen experience'],
  ['◫', 'CarPlay', 'Apple CarPlay'], ['▤', 'Android Auto', 'Stay connected'],
] as const

export function PublicAboutPage({ onNavigate }: PublicAboutPageProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    const previous = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false)
    addEventListener('keydown', close)
    return () => {
      document.documentElement.style.overflow = previous
      removeEventListener('keydown', close)
    }
  }, [menuOpen])

  const go = (key: AboutNavKey) => {
    setMenuOpen(false)
    onNavigate(key)
  }

  const features = () => {
    setMenuOpen(false)
    history.replaceState(history.state, '', '/about#features')
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="ht-about-page" data-web-information-route="about">
      <header className="ht-about-header">
        <button className="ht-about-logo" type="button" onClick={() => go('home')} aria-label="Hidden Tunes home">
          <img src="/brand/hidden-tunes-official.png" alt="" /><span>Hidden Tunes</span>
        </button>
        <button className="ht-about-menu-button" type="button" aria-expanded={menuOpen} aria-controls="about-navigation" onClick={() => setMenuOpen((open) => !open)}>
          <span /><span /><span /><b className="sr-only">Menu</b>
        </button>
        <nav id="about-navigation" className={menuOpen ? 'is-open' : ''} aria-label="Public website">
          <button type="button" onClick={() => go('home')}>Home</button>
          <button className="is-active" type="button" aria-current="page" onClick={() => go('about')}>About</button>
          <button type="button" onClick={features}>Features</button>
          <button type="button" onClick={() => go('worlds')}>Worlds</button>
          <button type="button" onClick={() => go('originals')}>Originals</button>
          <button type="button" onClick={() => go('contact')}>Contact</button>
          <button className="ht-about-search" type="button" aria-label="Search" onClick={() => go('search')}>⌕</button>
          <button className="ht-about-start" type="button" onClick={() => go('music')}>Get Started</button>
        </nav>
      </header>

      <main>
        <section className="ht-about-hero" aria-labelledby="about-title">
          <div className="ht-about-hero-copy">
            <h1 id="about-title">Entertainment That<br />Understands How You <em>Feel</em></h1>
            <p>Hidden Tunes is an emotionally intelligent entertainment platform that connects you with music, radio, podcasts, TV, sports, and worlds that match your mood, your energy, and your moment.</p>
            <div className="ht-about-hero-actions">
              <button type="button" onClick={() => go('music')}>Start Listening <span>▶</span></button>
              <button type="button" onClick={() => go('worlds')}>Explore Worlds</button>
            </div>
          </div>
        </section>

        <section id="features" className="ht-about-section ht-about-features" aria-labelledby="features-title">
          <h2 id="features-title">One World. More Ways to Listen.</h2>
          <div className="ht-about-media-grid">
            {mediaCards.map(([icon, title, copy, key]) => (
              <button key={title} type="button" onClick={() => go(key)}>
                <span aria-hidden="true">{icon}</span><h3>{title}</h3><p>{copy}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="ht-about-section ht-about-beyond">
          <div className="ht-about-beyond-copy">
            <h2>Beyond Genres</h2>
            <p>Hidden Tunes uses Emotional Music Intelligence to go beyond genres and labels—connecting you with what matches your mood, energy, warmth, calm, nostalgia, darkness, hope, and release.</p>
            <div className="ht-about-intelligence"><span>♡ Mood Aware</span><span>ϟ Energy Match</span><span>◉ Emotion First</span><span>∞ Always Evolving</span></div>
          </div>
          <div className="ht-about-wave-wrap" aria-label="A spectrum of musical emotions">
            <div className="ht-about-wave" aria-hidden="true">{Array.from({ length: 72 }, (_, i) => <i key={i} style={{ height: `${12 + Math.abs(Math.sin(i * .47)) * 52}px` }} />)}</div>
            <div className="ht-about-attributes"><span>☀ Warmth</span><span>♧ Calm</span><span>◷ Nostalgia</span><span>☾ Darkness</span><span>☆ Hope</span><span>➤ Release</span></div>
          </div>
        </section>

        <section className="ht-about-section ht-about-worlds" aria-labelledby="worlds-title">
          <header><h2 id="worlds-title">Emotional Worlds</h2><p>Enter a world that matches how you feel.</p><button type="button" onClick={() => go('worlds')}>View All Worlds →</button></header>
          <div className="ht-about-world-strip">
            {worlds.map(([title, copy, image, id]) => (
              <a key={title} href={`/emotional-worlds/${id}`}><img src={image} alt="" /><span><strong>{title}</strong><small>{copy}</small></span></a>
            ))}
          </div>
        </section>

        <section className="ht-about-section ht-about-originals">
          <div><h2>Hidden Tunes Originals</h2><p>Original music created with emotion, wisdom, and authenticity. Songs that speak to your soul and stay with you.</p><button type="button" onClick={() => go('originals')}>Explore Originals →</button></div>
          <figure><img src="/about/about-originals.png" alt="Singer recording a Hidden Tunes Original" /><figcaption><strong>Real artists. Real stories.<br />Real emotion.</strong><span>Only on Hidden Tunes.</span></figcaption></figure>
        </section>

        <section className="ht-about-section ht-about-global">
          <div><h2>Global by Design</h2><p>Discover the world through sound. Hidden Tunes connects you to music, radio, cultures, languages and hidden gems from every corner of the globe.</p><div className="ht-about-stats"><span><strong>Worldwide</strong>Reach</span><span><strong>Many</strong>Languages</span><span><strong>Live</strong>Radio</span><span><strong>Independent</strong>Creators</span></div></div>
          <img src="/about/about-world-map.png" alt="A glowing map showing Hidden Tunes' worldwide connections" />
        </section>

        <section className="ht-about-section ht-about-screens" aria-labelledby="screens-title">
          <h2 id="screens-title">Built for Every Screen</h2>
          <div>{devices.map(([icon, title, copy]) => <article key={title}><span aria-hidden="true">{icon}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
        </section>

        <section className="ht-about-section ht-about-purpose">
          <article><span aria-hidden="true">♥</span><div><h2>Our Mission</h2><p>To make entertainment more human by connecting people with music, stories, voices, and experiences that match the moments and emotions of their lives.</p></div></article>
          <article><span aria-hidden="true">✦</span><div><h2>Our Vision</h2><p>To build the world's most emotionally intelligent entertainment ecosystem.</p></div></article>
        </section>
      </main>

      <footer className="ht-about-footer">
        <div><strong>Hidden Tunes</strong><p>Entertainment that understands how you feel.</p></div>
        <nav aria-label="Footer"><button onClick={() => go('about')}>About</button><button onClick={() => go('contact')}>Contact</button><button onClick={() => go('music')}>Listen</button><button onClick={() => go('worlds')}>Worlds</button></nav>
        <small>© 2026 Hidden Tunes. All rights reserved.</small>
      </footer>
    </div>
  )
}
