/** Shared playable URL check for remote HTTPS and local download protocol. */
export function isPlayableMediaUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false
  const trimmed = url.trim()
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) return true
  if (trimmed.startsWith('ht-download://')) return true
  return false
}
