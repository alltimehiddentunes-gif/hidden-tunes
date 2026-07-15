let pendingResumeSeconds: number | null = null

export function setPendingAudiobookResumeSeconds(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    pendingResumeSeconds = null
    return
  }
  pendingResumeSeconds = Math.max(0, seconds)
}

export function consumePendingAudiobookResumeSeconds(): number | null {
  const value = pendingResumeSeconds
  pendingResumeSeconds = null
  return value
}
