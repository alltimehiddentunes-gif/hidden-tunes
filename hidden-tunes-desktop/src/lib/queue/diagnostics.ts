/** DEV-only structured queue diagnostics. */

export type QueueDiagnosticEvent =
  | 'queue_store_loaded'
  | 'queue_store_load_failed'
  | 'queue_store_saved'
  | 'queue_store_save_failed'
  | 'queue_enqueue'
  | 'queue_play_now'
  | 'queue_play_next'
  | 'queue_remove'
  | 'queue_move'
  | 'queue_clear'
  | 'queue_replace'
  | 'queue_active_changed'

const PREFIX = '[ht-queue]'

function shouldLog() {
  return Boolean(import.meta.env?.DEV)
}

/**
 * Emit a structured queue diagnostic.
 * Production builds stay silent. Avoid logging stream URLs or secrets.
 */
export function emitQueueDiagnostic(
  event: QueueDiagnosticEvent | string,
  payload?: Record<string, unknown>,
): void {
  if (!shouldLog()) return
  if (payload) {
    console.info(PREFIX, event, payload)
  } else {
    console.info(PREFIX, event)
  }
}
