let pendingResumeSeconds: number | null = null

export function setPendingPodcastResumeSeconds(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    pendingResumeSeconds = null
    return
  }
  pendingResumeSeconds = seconds
}

export function consumePendingPodcastResumeSeconds() {
  const value = pendingResumeSeconds
  pendingResumeSeconds = null
  return value
}
