export type MediaSource = "music" | "radio" | "youtube";

export type PlaybackRouteResult = {
  ok: boolean;
  error?: string;
  /** True when a newer station switch cancelled this request intentionally. */
  aborted?: boolean;
  /** Resolved HTTPS stream for the station that started (when ok). */
  streamUrl?: string;
};
