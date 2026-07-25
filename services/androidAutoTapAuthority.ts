/**
 * JS-side latest-wins authority for Android Auto music taps.
 * Mirrors native HiddenAudioPlaybackTransaction IDs delivered on play_from_media_id.
 */

let latestTransactionId = 0;

export function acceptAndroidAutoTransaction(transactionId: number) {
  const tx = Number(transactionId) || 0;
  if (tx > latestTransactionId) {
    latestTransactionId = tx;
  }
}

export function isAndroidAutoTransactionCurrent(transactionId: number) {
  const tx = Number(transactionId) || 0;
  if (tx <= 0) return true;
  return tx === latestTransactionId;
}

export function getLatestAndroidAutoTransactionId() {
  return latestTransactionId;
}

/** Test helper only. */
export function resetAndroidAutoTransactionAuthorityForTests() {
  latestTransactionId = 0;
}
