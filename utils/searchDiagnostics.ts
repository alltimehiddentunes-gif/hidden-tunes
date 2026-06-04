export type SearchDiagnosticEvent =
  | "search_started"
  | "search_internal_catalog_results"
  | "search_song_results"
  | "search_album_results"
  | "search_artist_results"
  | "search_room_results"
  | "search_station_results"
  | "search_external_fallback_used"
  | "search_empty_state_shown"
  | "search_result_tapped";

export type SearchDiagnosticDetails = Record<
  string,
  string | number | boolean | undefined
>;

import { isVerbosePlaybackDiagnosticsEnabled } from "./devDiagnostics";

function shouldLog() {
  return isVerbosePlaybackDiagnosticsEnabled();
}

export function logSearchDiagnostic(
  event: SearchDiagnosticEvent,
  details: SearchDiagnosticDetails = {}
) {
  if (!shouldLog()) return;
  console.log("[HiddenTunes:search]", event, {
    at: Date.now(),
    ...details,
  });
}
