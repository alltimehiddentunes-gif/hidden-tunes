/** One-shot resume offset applied when music startPlayback begins. */

let pendingResumeSeconds: number | null = null

export function setPendingMusicResumeSeconds(seconds: number | null | undefined): void {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    pendingResumeSeconds = null
    return
  }
  pendingResumeSeconds = seconds
}

export function consumePendingMusicResumeSeconds(): number | null {
  const value = pendingResumeSeconds
  pendingResumeSeconds = null
  return value
}

export function peekPendingMusicResumeSeconds(): number | null {
  return pendingResumeSeconds
}
