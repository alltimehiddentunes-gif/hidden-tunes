import { useCallback, useMemo, useState } from 'react'

const INITIAL = 24
const STEP = 24

/**
 * Windowed slice for large catalogue lists — never mounts thousands of cards.
 * Optionally requests the next server page when the local window catches up.
 */
export function useCatalogWindow<T>(
  items: T[],
  resetKey: string,
  options?: {
    hasServerMore?: boolean
    serverLoading?: boolean
    onNeedServerMore?: () => void
  },
) {
  const [limitByKey, setLimitByKey] = useState<Record<string, number>>({})
  const hasServerMore = Boolean(options?.hasServerMore)
  const serverLoading = Boolean(options?.serverLoading)
  const onNeedServerMore = options?.onNeedServerMore

  const limit = limitByKey[resetKey] ?? INITIAL

  const visible = useMemo(() => items.slice(0, limit), [items, limit])
  const hasMore = limit < items.length || hasServerMore

  const showMore = useCallback(() => {
    setLimitByKey((prev) => {
      const current = prev[resetKey] ?? INITIAL
      const next = current + STEP
      if (next >= items.length && hasServerMore && !serverLoading) {
        onNeedServerMore?.()
      }
      return {
        ...prev,
        [resetKey]: Math.min(next, Math.max(items.length, current)),
      }
    })
  }, [hasServerMore, items.length, onNeedServerMore, resetKey, serverLoading])

  return { visible, hasMore, showMore, shown: visible.length, serverLoading }
}
