/**
 * Desktop Sports client flags — fixtures-only pilot parity with mobile.
 * Streams stay off unless explicitly enabled via Vite env (not for production pilot).
 */

function readEnvFlag(name: string, fallback: boolean): boolean {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    const raw = env?.[name]
    if (raw == null || raw === '') return fallback
    const normalized = String(raw).trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  } catch {
    // Non-Vite contexts (Node verify scripts) fall through to default.
  }
  return fallback
}

/**
 * Verified legal streams only — must stay false for the fixtures-only pilot
 * (matches mobile `sports_streams_enabled: false`).
 */
export const DESKTOP_SPORTS_STREAMS_ENABLED = readEnvFlag(
  'VITE_SPORTS_STREAMS_ENABLED',
  false,
)

export function areSportsStreamsEnabled(): boolean {
  return DESKTOP_SPORTS_STREAMS_ENABLED === true
}

/** Honest streams-off copy shared by Sports browse + details. */
export const SPORTS_STREAMS_OFF_COPY =
  'Scores and fixture updates are available. Streaming is not currently enabled.'

export const SPORTS_STREAMS_OFF_SHORT = 'Live video is not available for this event.'
