#!/usr/bin/env python3
"""Phase 44M — Premium page PSD reconstruction + wiring."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'src/App.tsx'
CSS = ROOT / 'src/App.css'


def read(path: Path) -> str:
    return path.read_text(encoding='utf-8').replace('\r\n', '\n').replace('\r', '\n')


def write(path: Path, text: str) -> None:
    raw = path.read_bytes()
    newline = '\r\n' if b'\r\n' in raw else '\n'
    path.write_bytes(text.replace('\n', newline).encode('utf-8'))


app = read(APP)

pp_start = app.index('/* Phase 42B: no dedicated PSD reference')
pp_end = app.index('\n\nfunction TvPage(')

new_premium_page = """type PremiumFeatureAction = 'settings' | 'worlds'

type PremiumFeatureSpec = {
  id: string
  title: string
  description: string
  status: 'available' | 'coming-soon'
  action?: PremiumFeatureAction
  actionLabel?: string
}

type PremiumPlanSpec = {
  id: string
  title: string
  priceLabel: string
  detail: string
  badge?: string
}

const PREMIUM_FEATURE_SPECS: PremiumFeatureSpec[] = [
  {
    id: 'hq-audio',
    title: 'High Quality Audio',
    description: 'Choose standard, high-quality, or lossless playback for this desktop install.',
    status: 'available',
    action: 'settings',
    actionLabel: 'Open settings',
  },
  {
    id: 'worlds',
    title: 'Emotional Worlds',
    description: 'Browse cinematic listening scenes curated from your catalog moods and genres.',
    status: 'available',
    action: 'worlds',
    actionLabel: 'Browse worlds',
  },
  {
    id: 'cinema',
    title: 'Cinematic Player Modes',
    description: 'Full-screen premium player experiences with reactive visuals and lyrics stages.',
    status: 'coming-soon',
  },
  {
    id: 'offline',
    title: 'Offline Listening',
    description: 'Keep selected songs and playlists available when you are away from the network.',
    status: 'coming-soon',
  },
]

const PREMIUM_PLAN_SPECS: PremiumPlanSpec[] = [
  {
    id: 'monthly',
    title: 'Monthly',
    priceLabel: 'Coming soon',
    detail: 'Flexible membership preview for desktop.',
  },
  {
    id: 'annual',
    title: 'Annual',
    priceLabel: 'Coming soon',
    detail: 'Best value membership preview for desktop.',
    badge: 'Best value',
  },
]

function PremiumPage({ onNavigateNav }: { onNavigateNav: (navKey: NavKey) => void }) {
  const premiumHeroArt = getArtworkForPremium('hero')
  const featuresRef = useRef<HTMLElement | null>(null)
  const plansRef = useRef<HTMLElement | null>(null)

  const scrollToSection = useCallback((node: HTMLElement | null) => {
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleFeatureAction = useCallback(
    (feature: PremiumFeatureSpec) => {
      if (feature.status !== 'available' || !feature.action) return
      if (feature.action === 'settings') {
        onNavigateNav('settings')
        return
      }
      onNavigateNav('worlds')
    },
    [onNavigateNav],
  )

  return (
    <div className="psd-premium-destination">
      <PageFrame cinematic>
        <section className="psd-premium-hero" aria-labelledby="premium-heading">
          <EntityAtmosphereBackdrop
            className="psd-premium-hero-backdrop"
            artworkUrl={premiumHeroArt}
            label="Hidden Tunes Premium"
            variant="hero"
          />
          <div className="psd-premium-hero-veil" aria-hidden="true" />
          <div className="psd-premium-glow" aria-hidden="true" />
          <div className="psd-premium-hero-inner">
            <div className="psd-premium-hero-art" aria-hidden="true">
              <ArtworkImage
                src={premiumHeroArt}
                alt=""
                seed="premium-hero"
                label="Hidden Tunes Premium"
              />
            </div>
            <div className="psd-premium-hero-copy">
              <p className="psd-page-eyebrow">Hidden Tunes Premium</p>
              <h1 id="premium-heading">Unlock Every World</h1>
              <p className="psd-page-subtitle">
                Cinematic listening, deeper worlds, and gold-tier atmosphere — built for emotional immersion.
              </p>
              <div className="psd-hero-actions psd-premium-hero-actions">
                <button
                  type="button"
                  className="psd-btn psd-btn--gold"
                  onClick={() => scrollToSection(featuresRef.current)}
                >
                  Explore features
                </button>
                <button
                  type="button"
                  className="psd-btn psd-btn--ghost"
                  onClick={() => scrollToSection(plansRef.current)}
                >
                  Compare plans
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="psd-premium-notice" aria-label="Membership availability">
          <span className="psd-premium-notice-badge">Preview</span>
          <div className="psd-premium-notice-copy">
            <strong>Membership checkout is not available on this desktop preview.</strong>
            <p>
              Explore included playback quality settings and emotional worlds now. Billing and plan management will arrive in a future release.
            </p>
          </div>
          <button
            type="button"
            className="psd-btn psd-btn--ghost psd-btn--compact"
            onClick={() => onNavigateNav('settings')}
          >
            Manage in Settings
          </button>
        </section>

        <section
          ref={featuresRef}
          className="psd-premium-section"
          aria-labelledby="premium-features-heading"
        >
          <header className="psd-premium-section-header">
            <h2 id="premium-features-heading">Premium features</h2>
            <p>Only live capabilities are marked available. Everything else stays clearly preview-only.</p>
          </header>
          <div className="psd-premium-grid">
            {PREMIUM_FEATURE_SPECS.map((feature) => (
              <article key={feature.id} className="psd-premium-card" data-status={feature.status}>
                <div className="psd-premium-card-top">
                  <span className="psd-premium-card-icon" aria-hidden="true">✦</span>
                  <span className={`psd-premium-status${feature.status === 'available' ? ' is-live' : ''}`}>
                    {feature.status === 'available' ? 'Available' : 'Coming soon'}
                  </span>
                </div>
                <strong>{feature.title}</strong>
                <p>{feature.description}</p>
                {feature.status === 'available' && feature.action && feature.actionLabel ? (
                  <button
                    type="button"
                    className="psd-premium-card-action"
                    onClick={() => handleFeatureAction(feature)}
                  >
                    {feature.actionLabel}
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section
          ref={plansRef}
          className="psd-premium-section psd-premium-plans"
          aria-labelledby="premium-plans-heading"
        >
          <header className="psd-premium-section-header">
            <h2 id="premium-plans-heading">Plans</h2>
            <p>Preview pricing only — checkout is not connected on desktop yet.</p>
          </header>
          <div className="psd-premium-plan-grid">
            {PREMIUM_PLAN_SPECS.map((plan) => (
              <article key={plan.id} className="psd-premium-plan-card" data-plan={plan.id}>
                {plan.badge ? <span className="psd-premium-plan-badge">{plan.badge}</span> : null}
                <h3>{plan.title}</h3>
                <p className="psd-premium-plan-price">{plan.priceLabel}</p>
                <p className="psd-premium-plan-detail">{plan.detail}</p>
                <button type="button" className="psd-premium-plan-cta" disabled>
                  Not available yet
                </button>
              </article>
            ))}
          </div>
        </section>
      </PageFrame>
    </div>
  )
}

"""

app = app[:pp_start] + new_premium_page + app[pp_end:]

app = app.replace(
    "  if (activeNavKey === 'premium') return <PremiumPage />",
    "  if (activeNavKey === 'premium') return <PremiumPage onNavigateNav={onNavigateNav} />",
)

write(APP, app)

css = read(CSS)
css_block = """
/* —— Phase 44M: Premium PSD parity + wiring —— */
.psd-premium-hero-inner {
  display: grid;
  grid-template-columns: minmax(148px, 220px) minmax(0, 1fr);
  gap: clamp(18px, 2.5vw, 28px);
  align-items: center;
}

.psd-premium-hero-art,
.psd-premium-hero-art .art-frame {
  aspect-ratio: 1;
  border-radius: 18px;
  overflow: hidden;
  box-shadow:
    0 18px 42px rgba(0, 0, 0, 0.42),
    0 0 0 1px rgba(255, 186, 61, 0.18);
}

.psd-premium-hero-copy {
  min-width: 0;
}

.psd-premium-hero-actions {
  margin-top: 18px;
}

.psd-premium-notice {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 14px 18px;
  align-items: center;
  margin-bottom: clamp(22px, 3vw, 32px);
  padding: 16px 18px;
  border-radius: 18px;
  border: 1px solid rgba(255, 186, 61, 0.22);
  background:
    linear-gradient(135deg, rgba(255, 186, 61, 0.08), rgba(13, 13, 20, 0.88));
}

.psd-premium-notice-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent-gold-bright);
  background: rgba(255, 186, 61, 0.12);
  border: 1px solid rgba(255, 186, 61, 0.24);
}

.psd-premium-notice-copy strong {
  display: block;
  font-size: 14px;
  margin-bottom: 4px;
}

.psd-premium-notice-copy p {
  margin: 0;
  font-size: 13px;
  color: rgba(245, 243, 250, 0.68);
  line-height: 1.5;
}

.psd-btn--compact {
  min-height: 36px;
  padding: 0 14px;
  font-size: 12px;
}

.psd-premium-section {
  margin-bottom: clamp(24px, 3vw, 36px);
}

.psd-premium-section-header {
  margin-bottom: 14px;
}

.psd-premium-section-header h2 {
  margin: 0 0 6px;
  font-size: clamp(1.2rem, 2vw, 1.5rem);
}

.psd-premium-section-header p {
  margin: 0;
  font-size: 13px;
  color: var(--psd-metadata);
}

.psd-premium-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 100%;
}

.psd-premium-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.psd-premium-card p {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: rgba(245, 243, 250, 0.68);
  flex: 1;
}

.psd-premium-status {
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(245, 243, 250, 0.56);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.psd-premium-status.is-live {
  color: rgba(122, 240, 196, 0.92);
  background: rgba(64, 196, 140, 0.12);
  border-color: rgba(64, 196, 140, 0.24);
}

.psd-premium-card-action {
  align-self: flex-start;
  margin-top: auto;
  border: 1px solid rgba(255, 186, 61, 0.28);
  border-radius: 999px;
  background: rgba(255, 186, 61, 0.08);
  color: var(--accent-gold-bright);
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    transform var(--transition-fast);
}

.psd-premium-card-action:hover {
  background: rgba(255, 186, 61, 0.14);
  border-color: rgba(255, 186, 61, 0.42);
  transform: translateY(-1px);
}

.psd-premium-plan-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.psd-premium-plan-card {
  position: relative;
  padding: 20px 18px;
  border-radius: 18px;
  border: 1px solid rgba(255, 186, 61, 0.18);
  background:
    radial-gradient(circle at 100% 0%, rgba(255, 186, 61, 0.12), transparent 42%),
    rgba(13, 13, 20, 0.82);
}

.psd-premium-plan-card h3 {
  margin: 0 0 8px;
  font-size: 1.1rem;
}

.psd-premium-plan-badge {
  position: absolute;
  top: 14px;
  right: 14px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent-gold-bright);
  background: rgba(255, 186, 61, 0.12);
  border: 1px solid rgba(255, 186, 61, 0.24);
}

.psd-premium-plan-price {
  margin: 0 0 8px;
  font-size: clamp(1.35rem, 2vw, 1.8rem);
  font-weight: 700;
  color: var(--accent-gold-bright);
}

.psd-premium-plan-detail {
  margin: 0 0 16px;
  font-size: 13px;
  color: rgba(245, 243, 250, 0.64);
  line-height: 1.5;
}

.psd-premium-plan-cta {
  width: 100%;
  min-height: 42px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(245, 243, 250, 0.42);
  font-size: 13px;
  font-weight: 600;
  cursor: not-allowed;
}

@media (max-width: 900px) {
  .psd-premium-hero-inner,
  .psd-premium-notice,
  .psd-premium-plan-grid {
    grid-template-columns: 1fr;
  }

  .psd-premium-notice {
    align-items: start;
  }
}

"""
if 'Phase 44M: Premium PSD parity' not in css:
    marker_css = '/* —— Phase 44J:'
    if marker_css in css:
        css = css.replace(marker_css, css_block + marker_css)
    else:
        css = css.replace('.psd-premium-hero {', css_block + '.psd-premium-hero {', 1)
    write(CSS, css)

print('Phase 44M premium patch applied')
