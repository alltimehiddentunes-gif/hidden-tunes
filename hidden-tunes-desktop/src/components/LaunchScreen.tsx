import { memo, useMemo } from 'react'
import { VisualSceneBackdrop } from './VisualSceneBackdrop'
import { getTimeAwareHomeScene } from '../lib/visualScenes'

export type LaunchScreenProps = {
  exiting?: boolean
}

export const LaunchScreen = memo(function LaunchScreen({ exiting = false }: LaunchScreenProps) {
  const sceneId = useMemo(() => getTimeAwareHomeScene(), [])

  return (
    <div
      className={`launch-screen${exiting ? ' launch-screen--out' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy={!exiting}
      aria-label="Hidden Tunes Desktop is starting"
    >
      <VisualSceneBackdrop sceneId={sceneId} seed="launch-screen" variant="ambient" timeAware />
      <div className="launch-screen__scrim" aria-hidden="true" />
      <div className="launch-screen__content">
        <div className="launch-screen__brand-mark" aria-hidden="true">
          HT
        </div>
        <h1 className="launch-screen__title">Hidden Tunes</h1>
        <p className="launch-screen__subtitle">Desktop</p>
        <p className="launch-screen__message">Preparing your listening atmosphere</p>
        <div className="launch-screen__progress" aria-hidden="true">
          <span className="launch-screen__progress-bar" />
        </div>
      </div>
    </div>
  )
})
