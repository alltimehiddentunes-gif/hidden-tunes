import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'

export type TvDestination = {
  id: string
  label: string
  icon?: ReactNode
  selected?: boolean
  disabled?: boolean
  utility?: boolean
}

export type TvMediaCardModel = {
  id: string
  title: string
  subtitle?: string
  imageUrl?: string | null
  imageAlt?: string
  badge?: string
  progress?: number | null
  selected?: boolean
}

export type TvCardVariant = 'landscape' | 'portrait' | 'artist' | 'world' | 'progress' | 'category' | 'channel'

const focusableSelector = '[data-focusable]:not([disabled]),button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function TvShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return <div className="tv-premium-shell">{sidebar}<main className="tv-premium-main">{children}</main></div>
}

export function TvSidebar({ destinations, onNavigate, brand, profile }: {
  destinations: TvDestination[]
  onNavigate: (destination: TvDestination) => void
  brand: ReactNode
  profile?: ReactNode
}) {
  const primary = destinations.filter((item) => !item.utility)
  const utilities = destinations.filter((item) => item.utility)
  const render = (item: TvDestination) => (
    <TvFocusButton
      key={item.id}
      className="tv-sidebar-item"
      focusId={`tv-nav-${item.id}`}
      selected={item.selected}
      disabled={item.disabled}
      onPress={() => onNavigate(item)}
    >
      <span className="tv-sidebar-icon" aria-hidden="true">{item.icon}</span>
      <span>{item.label}</span>
    </TvFocusButton>
  )
  return (
    <aside className="tv-premium-sidebar" aria-label="Primary">
      <div className="tv-sidebar-brand">{brand}</div>
      <nav>{primary.map(render)}</nav>
      <nav className="tv-sidebar-utilities" aria-label="Account and settings">{utilities.map(render)}</nav>
      {profile && <div className="tv-sidebar-profile">{profile}</div>}
    </aside>
  )
}

export function TvPage({ children, label }: { children: ReactNode; label: string }) {
  return <section className="tv-page" aria-label={label}>{children}</section>
}

export function TvPageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return <header className="tv-page-header">{eyebrow && <span>{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}{actions}</header>
}

export function TvFocusButton({ children, onPress, focusId, selected, loading, className = '', disabled, ariaLabel }: {
  children: ReactNode
  onPress?: () => void
  focusId: string
  selected?: boolean
  loading?: boolean
  className?: string
  disabled?: boolean
  ariaLabel?: string
}) {
  return <button type="button" data-focusable data-focus-id={focusId} data-tv-state={loading ? 'loading' : selected ? 'selected' : 'default'} aria-label={ariaLabel} aria-pressed={selected} disabled={disabled || loading} className={`tv-focus-button ${className}`} onClick={onPress}>{children}</button>
}

export function TvImage({ src, alt, eager = false, sizes = '(max-width: 1280px) 320px, 480px', className = '' }: {
  src?: string | null
  alt: string
  eager?: boolean
  sizes?: string
  className?: string
}) {
  if (!src) return <span className={`tv-image-fallback ${className}`} aria-label={alt || 'Artwork unavailable'} />
  return <img className={className} src={src} alt={alt} sizes={sizes} loading={eager ? 'eager' : 'lazy'} decoding="async" fetchPriority={eager ? 'high' : 'auto'} onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.nextElementSibling?.removeAttribute('hidden') }} />
}

export function TvMediaCard({ item, variant = 'landscape', onSelect, eager = false }: {
  item: TvMediaCardModel
  variant?: TvCardVariant
  onSelect: (item: TvMediaCardModel) => void
  eager?: boolean
}) {
  const progress = item.progress == null ? null : Math.min(100, Math.max(0, item.progress))
  return <TvFocusButton focusId={`tv-card-${item.id}`} selected={item.selected} className={`tv-media-card tv-media-card--${variant}`} ariaLabel={item.title} onPress={() => onSelect(item)}>
    <span className="tv-card-art">
      <TvImage src={item.imageUrl} alt={item.imageAlt || ''} eager={eager} />
      <span className="tv-image-fallback" hidden aria-hidden="true" />
      {item.badge && <span className="tv-card-badge">{item.badge}</span>}
      {progress != null && <span className="tv-card-progress" aria-label={`${Math.round(progress)} percent complete`}><i style={{ '--tv-progress': `${progress}%` } as CSSProperties} /></span>}
    </span>
    <strong>{item.title}</strong>{item.subtitle && <small>{item.subtitle}</small>}
  </TvFocusButton>
}

export function TvRail({ id, title, items, variant, onSelect, maxMounted = 18 }: {
  id: string
  title: string
  items: TvMediaCardModel[]
  variant?: TvCardVariant
  onSelect: (item: TvMediaCardModel) => void
  maxMounted?: number
}) {
  const bounded = useMemo(() => items.slice(0, Math.max(1, maxMounted)), [items, maxMounted])
  return <section className="tv-rail-section"><h2>{title}</h2><div className="tv-rail" data-tv-rail={id} role="list">{bounded.map((item, index) => <div role="listitem" key={item.id}><TvMediaCard item={item} variant={variant} eager={index < 3} onSelect={onSelect} /></div>)}</div></section>
}

export function TvHero({ eyebrow, title, description, imageUrl, badge, meta, primaryAction, secondaryAction, variant = 'purple' }: {
  eyebrow?: string
  title: string
  description?: string
  imageUrl?: string | null
  badge?: string
  meta?: string
  primaryAction: { label: string; onPress: () => void }
  secondaryAction?: { label: string; onPress: () => void }
  variant?: 'purple' | 'gold' | 'cyan' | 'world'
}) {
  return <section className={`tv-hero tv-hero--${variant}`}>
    <div className="tv-hero-media"><TvImage src={imageUrl} alt="" eager sizes="100vw" /></div>
    <div className="tv-hero-overlay" /><div className="tv-hero-content">{eyebrow && <span className="tv-hero-eyebrow">{eyebrow}</span>}{badge && <span className="tv-hero-badge">{badge}</span>}<h1>{title}</h1>{description && <p>{description}</p>}{meta && <small>{meta}</small>}<div className="tv-hero-actions"><TvFocusButton focusId="tv-hero-primary" className="tv-button-primary" onPress={primaryAction.onPress}>{primaryAction.label}</TvFocusButton>{secondaryAction && <TvFocusButton focusId="tv-hero-secondary" onPress={secondaryAction.onPress}>{secondaryAction.label}</TvFocusButton>}</div></div>
  </section>
}

export function TvDialog({ open, title, description, children, onClose }: {
  open: boolean
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const originRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open) return
    originRef.current = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    requestAnimationFrame(() => dialog?.querySelector<HTMLElement>(focusableSelector)?.focus())
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Back' || event.keyCode === 10009 || event.keyCode === 461) { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab' || !dialog) return
      const nodes = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      if (!nodes.length) return
      const first = nodes[0]; const last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    addEventListener('keydown', onKey, true)
    return () => { removeEventListener('keydown', onKey, true); requestAnimationFrame(() => originRef.current?.focus({ preventScroll: true })) }
  }, [open, onClose])
  if (!open) return null
  return <div className="tv-dialog-backdrop" role="presentation"><div ref={dialogRef} className="tv-dialog" role="dialog" aria-modal="true" aria-labelledby="tv-dialog-title"><h2 id="tv-dialog-title">{title}</h2>{description && <p>{description}</p>}<div className="tv-dialog-actions">{children}</div></div></div>
}

function TvState({ kind, title, message, action }: { kind: string; title: string; message: string; action?: { label: string; onPress: () => void } }) {
  return <section className={`tv-system-state tv-system-state--${kind}`} role={kind === 'error' ? 'alert' : 'status'}><span className="tv-system-state-mark" aria-hidden="true" /><h2>{title}</h2><p>{message}</p>{action && <TvFocusButton focusId={`tv-state-${kind}`} onPress={action.onPress}>{action.label}</TvFocusButton>}</section>
}
export const TvLoadingState = ({ title = 'Loading', message = 'Preparing your experience.' }: { title?: string; message?: string }) => <TvState kind="loading" title={title} message={message} />
export const TvEmptyState = ({ title, message, action }: { title: string; message: string; action?: { label: string; onPress: () => void } }) => <TvState kind="empty" title={title} message={message} action={action} />
export const TvErrorState = ({ title = 'Something went wrong', message, retry }: { title?: string; message: string; retry: () => void }) => <TvState kind="error" title={title} message={message} action={{ label: 'Retry', onPress: retry }} />
export const TvOfflineState = ({ retry }: { retry: () => void }) => <TvState kind="offline" title="You’re offline" message="Reconnect to continue streaming Hidden Tunes." action={{ label: 'Try again', onPress: retry }} />
