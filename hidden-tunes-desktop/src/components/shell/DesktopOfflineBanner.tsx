import { useDesktopConnectivity } from '../../lib/downloads/useDesktopConnectivity'

type DesktopOfflineBannerProps = {
  onOpenDownloads?: () => void
}

/**
 * Global advisory offline chrome — does not block browsing local catalog/downloads.
 */
export function DesktopOfflineBanner({ onOpenDownloads }: DesktopOfflineBannerProps) {
  const { offline } = useDesktopConnectivity()
  if (!offline) return null

  return (
    <div className="desktop-offline-banner" role="status" data-connectivity="offline">
      <span className="desktop-offline-banner-dot" aria-hidden="true" />
      <p>
        You appear to be offline. Browsing uses any saved catalog on this device. Live refresh and new
        downloads need a connection.
      </p>
      {onOpenDownloads ? (
        <button type="button" className="btn-secondary btn-sm" onClick={onOpenDownloads}>
          Open Downloads
        </button>
      ) : null}
    </div>
  )
}
