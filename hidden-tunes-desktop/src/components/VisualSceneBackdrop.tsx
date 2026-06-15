import { memo, useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  getParticleCount,
  getSceneVariation,
  getTimeAtmosphere,
  getVisualSceneCssVars,
  type VisualSceneId,
  type VisualSceneVariant,
} from '../lib/visualScenes'

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return reduced
}

export type VisualSceneBackdropProps = {
  sceneId: VisualSceneId
  seed: string
  variant?: VisualSceneVariant
  className?: string
  timeAware?: boolean
}

export const VisualSceneBackdrop = memo(function VisualSceneBackdrop({
  sceneId,
  seed,
  variant = 'card',
  className = '',
  timeAware = true,
}: VisualSceneBackdropProps) {
  const reducedMotion = usePrefersReducedMotion()
  const [atmosphere, setAtmosphere] = useState(() => getTimeAtmosphere())

  useEffect(() => {
    if (!timeAware) return undefined
    const tick = () => setAtmosphere(getTimeAtmosphere())
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [timeAware])

  const variation = useMemo(() => getSceneVariation(`${sceneId}:${seed}`), [sceneId, seed])

  const style = useMemo(
    () =>
      getVisualSceneCssVars(sceneId, seed, timeAware ? atmosphere : undefined) as CSSProperties,
    [sceneId, seed, atmosphere, timeAware],
  )

  const particleCount = getParticleCount(variant, reducedMotion)
  const particles = useMemo(
    () => Array.from({ length: particleCount }, (_, i) => i),
    [particleCount],
  )

  const rootClass = [
    'visual-scene',
    `visual-scene--${variant}`,
    reducedMotion ? 'visual-scene--static' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={rootClass}
      data-scene={sceneId}
      data-atmosphere={atmosphere}
      data-variant={variation.variant}
      style={style}
      aria-hidden="true"
    >
      <div className="visual-scene__base" />
      <div className="visual-scene__glow" />
      <div className="visual-scene__shape visual-scene__shape--a" />
      <div className="visual-scene__shape visual-scene__shape--b" />
      {particles.map((i) => (
        <span key={i} className="visual-scene__particle" data-i={i} />
      ))}
      <div className="visual-scene__grain" />
      <div className="visual-scene__vignette" />
      <div className="visual-scene__atmosphere" />
    </div>
  )
})
