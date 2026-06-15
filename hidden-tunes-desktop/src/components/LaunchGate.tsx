import { useEffect, useState, type ReactNode } from 'react'
import { LaunchScreen } from './LaunchScreen'

const MIN_VISIBLE_MS = 650
const FADE_MS = 480

type LaunchPhase = 'visible' | 'fading' | 'hidden'

function removeHtmlSplash() {
  document.getElementById('launch-splash')?.remove()
}

type LaunchGateProps = {
  children: ReactNode
  loading: boolean
  hasCatalogData: boolean
}

export function LaunchGate({ children, loading, hasCatalogData }: LaunchGateProps) {
  const [phase, setPhase] = useState<LaunchPhase>('visible')
  const [minElapsed, setMinElapsed] = useState(false)

  useEffect(() => {
    removeHtmlSplash()
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS)
    return () => window.clearTimeout(id)
  }, [])

  const ready = minElapsed && (!loading || hasCatalogData)

  useEffect(() => {
    if (!ready || phase !== 'visible') return undefined
    setPhase('fading')
    const id = window.setTimeout(() => {
      setPhase('hidden')
      removeHtmlSplash()
    }, FADE_MS)
    return () => window.clearTimeout(id)
  }, [ready, phase])

  if (phase === 'hidden') {
    return children
  }

  return (
    <>
      <div className="app-shell-wrap app-shell-wrap--booting" aria-hidden="true">
        {children}
      </div>
      <LaunchScreen exiting={phase === 'fading'} />
    </>
  )
}
