const PREFIX = "[podcast]";

export type PodcastDiagnosticEvent =
  | "podcast_home_load_start"
  | "podcast_home_load_success"
  | "podcast_home_load_failed"
  | "podcast_feed_parse_failed"
  | "podcast_episode_missing_audio"
  | "mature_podcast_blocked"
  | "podcast_episode_play_start"
  | "podcast_episode_play_success"
  | "podcast_episode_play_failed"
  | "podcast_static_home_rendered"
  | "podcast_home_rss_disabled"
  | "podcast_category_hidden_empty"
  | "podcast_search_started"
  | "podcast_search_results"
  | "mature_podcast_category_hidden_empty"
  | "podcast_show_feed_load_start"
  | "podcast_show_feed_load_success"
  | "podcast_show_feed_load_failed"
  | "podcast_show_feed_timeout"
  | "podcast_auto_next_queue_created";

export function logPodcastDiagnostic(
  event: PodcastDiagnosticEvent,
  payload?: Record<string, unknown>
) {
  if (!__DEV__) return;
  if (payload) {
    console.log(`${PREFIX} ${event}`, payload);
  } else {
    console.log(`${PREFIX} ${event}`);
  }
}
