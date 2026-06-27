let tvPlayerOpenCount = 0;
let tvTabFocused = false;

export function markTvPlayerOpen() {
  tvPlayerOpenCount += 1;
}

export function markTvPlayerClosed() {
  tvPlayerOpenCount = Math.max(0, tvPlayerOpenCount - 1);
}

export function isTvPlayerOpen() {
  return tvPlayerOpenCount > 0;
}

export function setTvTabFocused(focused: boolean) {
  tvTabFocused = focused;
}

export function isTvTabFocused() {
  return tvTabFocused;
}
