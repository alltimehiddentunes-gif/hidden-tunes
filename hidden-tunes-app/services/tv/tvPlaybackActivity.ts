/**
 * TV activity flags consumed by audio polling and channel verification.
 * `isTvPlayerOpen` means any active TV session (floating or full), not only `/tv-player`.
 */

let tvSessionActive = false;
let tvTabFocused = false;
/** @deprecated Prefer setTvSessionActive — kept for gradual call-site migration. */
let tvPlayerOpenCount = 0;

export function setTvSessionActive(active: boolean) {
  tvSessionActive = active;
  tvPlayerOpenCount = active ? 1 : 0;
}

export function markTvPlayerOpen() {
  // Legacy route-based counting — sync to session-active semantics.
  tvPlayerOpenCount += 1;
  tvSessionActive = tvPlayerOpenCount > 0;
}

export function markTvPlayerClosed() {
  tvPlayerOpenCount = Math.max(0, tvPlayerOpenCount - 1);
  tvSessionActive = tvPlayerOpenCount > 0;
}

export function isTvPlayerOpen() {
  return tvSessionActive || tvPlayerOpenCount > 0;
}

export function setTvTabFocused(focused: boolean) {
  tvTabFocused = focused;
}

export function isTvTabFocused() {
  return tvTabFocused;
}
