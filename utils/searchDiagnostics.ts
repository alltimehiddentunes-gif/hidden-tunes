export type SearchDiagnosticEvent =
  | "search_started"
  | "search_internal_catalog_results"
  | "search_song_results"
  | "search_album_results"
  | "search_artist_results"
  | "search_room_results"
  | "search_station_results"
  | "search_tv_results"
  | "search_external_fallback_used"
  | "search_empty_state_shown"
  | "search_result_tapped"
  | "search_backend_query_start"
  | "search_backend_query_success"
  | "search_backend_query_failed"
  | "search_backend_results_merged"
  | "search_empty_waiting_for_backend"
  | "search_empty_after_all_sources"
  | "search_result_source_backend"
  | "search_backend_cache_hit"
  | "search_backend_immediate_start"
  | "search_backend_immediate_success"
  | "search_backend_immediate_failed"
  | "search_backend_immediate_cache_hit"
  | "search_empty_blocked_backend_loading"
  | "search_empty_true_after_backend"
  | "search_backend_result_promoted"
  | "search_backend_q_may_not_be_full_catalog"
  | "search_ranking_applied"
  | "search_top_result"
  | "search_result_score"
  | "provider_start"
  | "provider_success"
  | "provider_error"
  | "provider_timeout"
  | "provider_empty"
  | "merge_complete"
  | "fallback_shown"
  | "search_direct_match_count"
  | "search_fallback_demoted";

export type SearchDiagnosticDetails = Record<
  string,
  string | number | boolean | undefined | null
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

export function logSearchRankingDiagnostics(details: SearchDiagnosticDetails = {}) {
  logSearchDiagnostic("search_ranking_applied", details);
  if (details.topResult) {
    logSearchDiagnostic("search_top_result", {
      query: details.query,
      topResult: details.topResult,
      topScore: details.topScore,
      topReason: details.topReason,
    });
  }
  if (typeof details.topScore === "number") {
    logSearchDiagnostic("search_result_score", {
      query: details.query,
      topScore: details.topScore,
      topReason: details.topReason,
    });
  }
  if (typeof details.directMatchCount === "number") {
    logSearchDiagnostic("search_direct_match_count", {
      query: details.query,
      count: details.directMatchCount,
    });
  }
  if (typeof details.fallbackDemotedCount === "number") {
    logSearchDiagnostic("search_fallback_demoted", {
      query: details.query,
      count: details.fallbackDemotedCount,
    });
  }
}
