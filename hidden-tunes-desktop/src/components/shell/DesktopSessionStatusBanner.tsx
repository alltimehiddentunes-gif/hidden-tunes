import { useDesktopAuth } from '../../context/useDesktopAuth'

/**
 * Surfaces session-expired honesty without stopping playback.
 */
export function DesktopSessionStatusBanner() {
  const { sessionNotice, clearSessionNotice, openSignIn } = useDesktopAuth()
  if (!sessionNotice) return null

  return (
    <div className="desktop-session-banner" role="status" data-auth="session-expired">
      <p>{sessionNotice}</p>
      <div className="desktop-session-banner-actions">
        <button type="button" className="btn-primary btn-sm" onClick={openSignIn}>
          Sign in
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={clearSessionNotice}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
