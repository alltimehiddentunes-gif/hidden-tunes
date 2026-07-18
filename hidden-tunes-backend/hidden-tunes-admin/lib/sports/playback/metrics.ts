/**
 * Sports playback metrics — no private URLs or tokens.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const SPORTS_METRIC_KEYS = [
  "resolver_requests",
  "ready_responses",
  "external_responses",
  "subscription_responses",
  "unavailable_responses",
  "validation_successes",
  "validation_failures",
  "tap_to_player_open_success",
  "player_load_success",
  "resolver_latency_ms_sum",
  "resolver_latency_ms_count",
  "player_start_latency_ms_sum",
  "player_start_latency_ms_count",
  "fallback_use",
  "session_expiry_failures",
  "provider_failures",
] as const;

export type SportsMetricKey = (typeof SPORTS_METRIC_KEYS)[number];

export async function recordSportsMetric(
  key: SportsMetricKey,
  amount = 1,
  providerId?: string | null
): Promise<void> {
  const windowStart = new Date();
  windowStart.setMinutes(0, 0, 0);
  const window_start = windowStart.toISOString();

  try {
    const { data: existing } = await supabaseAdmin
      .from("sports_playback_metrics")
      .select("id, metric_value")
      .eq("metric_key", key)
      .eq("window_start", window_start)
      .is("provider_id", providerId || null)
      .maybeSingle();

    if (existing?.id) {
      await supabaseAdmin
        .from("sports_playback_metrics")
        .update({
          metric_value: Number(existing.metric_value || 0) + amount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      return;
    }

    await supabaseAdmin.from("sports_playback_metrics").insert({
      metric_key: key,
      metric_value: amount,
      provider_id: providerId || null,
      window_start,
    });
  } catch {
    // Metrics must never break playback.
  }
}

export async function recordResolverLatency(ms: number): Promise<void> {
  await Promise.all([
    recordSportsMetric("resolver_latency_ms_sum", Math.max(0, Math.floor(ms))),
    recordSportsMetric("resolver_latency_ms_count", 1),
  ]);
}
