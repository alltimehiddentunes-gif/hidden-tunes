import { memo, useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  getDayPeriod,
  getParticleCount,
  getSceneVariation,
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

const SCENE_BLEND_MS = 480
const SCENE_BLEND_OPACITY = 0.82

export const VisualSceneBackdrop = memo(function VisualSceneBackdrop({
  sceneId,
  seed,
  variant = 'card',
  className = '',
  timeAware = true,
}: VisualSceneBackdropProps) {
  const reducedMotion = usePrefersReducedMotion()
  const [dayPeriod, setDayPeriod] = useState(() => getDayPeriod())
  const [renderedSceneId, setRenderedSceneId] = useState(sceneId)
  const [blendIn, setBlendIn] = useState(true)

  useEffect(() => {
    if (!timeAware) return undefined
    const tick = () => setDayPeriod(getDayPeriod())
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [timeAware])

  useEffect(() => {
    if (sceneId === renderedSceneId) return undefined
    if (reducedMotion) {
      setRenderedSceneId(sceneId)
      setBlendIn(true)
      return undefined
    }
    setBlendIn(false)
    const id = window.setTimeout(() => {
      setRenderedSceneId(sceneId)
      requestAnimationFrame(() => setBlendIn(true))
    }, SCENE_BLEND_MS)
    return () => window.clearTimeout(id)
  }, [sceneId, renderedSceneId, reducedMotion])

  const variation = useMemo(
    () => getSceneVariation(`${renderedSceneId}:${seed}`),
    [renderedSceneId, seed],
  )

  const style = useMemo(
    () =>
      ({
        ...getVisualSceneCssVars(renderedSceneId, seed, { timeAware }),
        opacity: blendIn ? 1 : SCENE_BLEND_OPACITY,
      }) as CSSProperties,
    [renderedSceneId, seed, timeAware, blendIn],
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
    blendIn ? '' : 'visual-scene--blending',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={rootClass}
      data-scene={renderedSceneId}
      data-day-period={dayPeriod}
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
