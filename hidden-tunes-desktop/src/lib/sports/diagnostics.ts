/** DEV-only structured Sports diagnostics. */

export type SportsDiagnosticEvent =
  | 'sports_browse_started'
  | 'sports_browse_completed'
  | 'sports_browse_failed'
  | 'sports_fixture_opened'
  | 'sports_play_resolution_started'
  | 'sports_play_resolution_succeeded'
  | 'sports_play_resolution_failed'
  | 'sports_playback_started'
  | 'sports_playback_stopped'
  | 'sports_status_conflict'
  | 'sports_playability_conflict'
  | 'sports_missing_start_time'
  | 'sports_unknown_status'

const PREFIX = '[ht-sports]'

function shouldLog() {
  return Boolean(import.meta.env?.DEV)
}

/**
 * Emit a structured Sports diagnostic.
 * Production builds stay silent. Never log full stream URLs — hostname only.
 */
export function emitSportsDiagnostic(
  event: SportsDiagnosticEvent | string,
  payload?: Record<string, unknown>,
): void {
  if (!shouldLog()) return
  if (payload) {
    console.info(PREFIX, event, payload)
  } else {
    console.info(PREFIX, event)
  }
}
