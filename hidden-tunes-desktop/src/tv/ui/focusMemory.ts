export type TvFocusSnapshot = {
  focusId: string | null
  railId: string | null
  railIndex: number
  verticalOffset: number
}

const snapshots = new Map<string, TvFocusSnapshot>()

function activeFocusId() {
  const active = document.activeElement as HTMLElement | null
  return active?.dataset.focusId || active?.id || null
}

export function captureTvFocus(routeKey: string): TvFocusSnapshot {
  const active = document.activeElement as HTMLElement | null
  const rail = active?.closest<HTMLElement>('[data-tv-rail]')
  const items = rail ? Array.from(rail.querySelectorAll<HTMLElement>('[data-focusable]')) : []
  const snapshot = {
    focusId: activeFocusId(),
    railId: rail?.dataset.tvRail || null,
    railIndex: active ? Math.max(0, items.indexOf(active)) : 0,
    verticalOffset: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tv-offset-y')) || 0,
  }
  snapshots.set(routeKey, snapshot)
  return snapshot
}

export function restoreTvFocus(routeKey: string) {
  const snapshot = snapshots.get(routeKey)
  if (!snapshot) return false
  const byId = snapshot.focusId
    ? document.querySelector<HTMLElement>(`[data-focus-id="${CSS.escape(snapshot.focusId)}"],#${CSS.escape(snapshot.focusId)}`)
    : null
  const rail = snapshot.railId
    ? document.querySelector<HTMLElement>(`[data-tv-rail="${CSS.escape(snapshot.railId)}"]`)
    : null
  const target = byId || rail?.querySelectorAll<HTMLElement>('[data-focusable]')[snapshot.railIndex] || null
  target?.focus({ preventScroll: true })
  return Boolean(target)
}

export function forgetTvFocus(routeKey: string) {
  snapshots.delete(routeKey)
}
