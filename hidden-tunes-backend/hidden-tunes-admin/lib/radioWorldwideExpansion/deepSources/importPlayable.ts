import type { SupabaseClient } from "@supabase/supabase-js";

import {
  findExistingRadioStationId,
  insertNewRadioStationOnly,
} from "@/lib/radioExpansion25k/insertOnlyImport";
import type { NormalizedRadioStation } from "@/lib/radioNormalization";
import {
  applyRadioVerificationProbe,
  probeRadioStream,
} from "@/lib/radioStreamVerification";

export async function importPlayableCandidate(
  supabase: SupabaseClient,
  candidate: NormalizedRadioStation,
  execute: boolean
) {
  const probe = await probeRadioStream(candidate.stream_url, {
    timeoutMs: 12_000,
    maxRedirects: 5,
    maxPlaylistBytes: 128 * 1024,
    maxReadBytes: 24 * 1024,
  });
  if (!probe.playable) {
    return { outcome: "probe_failed" as const, reason: probe.outcome };
  }

  const existing = await findExistingRadioStationId(supabase, candidate);
  if (existing) {
    if (execute) {
      const { data: row } = await supabase
        .from("radio_stations")
        .select(
          "id,reliability_score,consecutive_failures,playback_status,quarantined_at,disabled_at,is_verified"
        )
        .eq("id", existing.id)
        .maybeSingle();
      if (row) {
        const update = applyRadioVerificationProbe(row as never, probe);
        await supabase
          .from("radio_stations")
          .update({
            ...update,
            delivery_mode: candidate.stream_url.startsWith("https://")
              ? "direct_https"
              : "backend_relay",
            resolved_stream_url: probe.finalUrl || candidate.stream_url,
          })
          .eq("id", existing.id);
      }
    }
    return { outcome: "duplicate" as const, id: existing.id };
  }

  if (!execute) return { outcome: "dry_run_would_insert" as const };

  const inserted = await insertNewRadioStationOnly(supabase, candidate, { dryRun: false });
  if (inserted.outcome !== "inserted" || !inserted.stationId) {
    return { outcome: "insert_failed" as const, error: inserted.error };
  }
  const update = applyRadioVerificationProbe(
    { id: inserted.stationId, reliability_score: 0, consecutive_failures: 0 } as never,
    probe
  );
  await supabase
    .from("radio_stations")
    .update({
      ...update,
      delivery_mode: candidate.stream_url.startsWith("https://") ? "direct_https" : "backend_relay",
      resolved_stream_url: probe.finalUrl || candidate.stream_url,
    })
    .eq("id", inserted.stationId);
  return { outcome: "imported" as const, id: inserted.stationId };
}
