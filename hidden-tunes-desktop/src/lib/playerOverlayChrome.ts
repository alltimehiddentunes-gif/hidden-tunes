let overlayScrollLockCount = 0
let savedBodyOverflow = ''

export function acquirePlayerOverlayScrollLock(): () => void {
  if (typeof document === 'undefined') {
    return () => undefined
  }

  if (overlayScrollLockCount === 0) {
    savedBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }

  overlayScrollLockCount += 1
  let released = false

  return () => {
    if (released) return
    released = true
    overlayScrollLockCount = Math.max(0, overlayScrollLockCount - 1)
    if (overlayScrollLockCount === 0) {
      document.body.style.overflow = savedBodyOverflow
    }
  }
}
