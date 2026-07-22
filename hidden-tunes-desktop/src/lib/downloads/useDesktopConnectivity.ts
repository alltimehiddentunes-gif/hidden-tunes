import { useEffect, useState } from 'react'

/**
 * Advisory connectivity signal — does not poll.
 * Online does not guarantee API success; offline means local-only actions.
 */
export function useDesktopConnectivity() {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return { online, offline: !online }
}
