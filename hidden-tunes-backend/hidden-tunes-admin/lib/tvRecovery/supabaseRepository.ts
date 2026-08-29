import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type {
  TvRecoveryAuditEvent,
  TvRecoveryPatch,
  TvRecoveryStation,
} from "@/lib/tvRecovery/types";
import type { TvRecoveryRepository } from "@/lib/tvRecovery/worker";

const TV_RECOVERY_SELECT = [
  "id",
  "title",
  "source_type",
  "source_id",
  "source_key",
  "source_url",
  "validated_stream_url",
  "embed_url",
  "status",
  "playback_status",
  "is_active",
  "reliability_score",
  "consecutive_failures",
  "quarantined_at",
  "disabled_at",
  "last_health_checked_at",
  "last_health_error",
  "last_validation_result",
  "ios_playable",
  "android_playable",
  "stream_protocol",
  "stream_is_https",
  "created_at",
  "updated_at",
].join(", ");

export function createSupabaseTvRecoveryRepository(options: {
  client?: typeof supabaseAdmin;
  staleBeforeIso?: string;
  auditSink?: (events: TvRecoveryAuditEvent[]) => Promise<void> | void;
  cacheInvalidator?: () => Promise<string>;
  targetIds?: string[];
} = {}): TvRecoveryRepository {
  const client = options.client || supabaseAdmin;
  const staleBeforeIso =
    options.staleBeforeIso || new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  return {
    async loadBatch({ cursor, limit }) {
      let query = client
        .from("tv_videos")
        .select(TV_RECOVERY_SELECT)
        .or(
          `is_active.eq.false,playback_status.neq.playable,last_health_checked_at.is.null,last_health_checked_at.lt.${staleBeforeIso}`
        )
        .order("id", { ascending: true })
        .limit(limit);
      if (options.targetIds?.length) query = query.in("id", options.targetIds);
      if (cursor) query = query.gt("id", cursor);
      const { data, error } = await query;
      if (error) throw new Error(`TV recovery batch load failed: ${error.message}`);
      const stations = (data || []) as unknown as TvRecoveryStation[];
      return {
        stations,
        nextCursor: stations.at(-1)?.id || cursor,
        done: stations.length < limit,
      };
    },

    async loadDuplicateContext() {
      const pageSize = 1_000;
      const rows: TvRecoveryStation[] = [];
      for (let from = 0; from < 100_000; from += pageSize) {
        const { data, error } = await client
          .from("tv_videos")
          .select(TV_RECOVERY_SELECT)
          .order("id", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw new Error(`TV duplicate context load failed: ${error.message}`);
        const page = (data || []) as unknown as TvRecoveryStation[];
        rows.push(...page);
        if (page.length < pageSize) break;
      }
      return rows;
    },

    async updateStation({ stationId, expectedUpdatedAt, patch }) {
      let query = client.from("tv_videos").update(patch).eq("id", stationId);
      if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
      const { data, error } = await query.select("id").maybeSingle();
      if (error) throw new Error(`TV recovery update failed for ${stationId}: ${error.message}`);
      if (!data) {
        throw new Error(`TV recovery optimistic-lock conflict for ${stationId}; no row was changed.`);
      }
    },

    async appendAudit(events) {
      if (options.auditSink) {
        await options.auditSink(events);
        return;
      }
      for (const event of events) {
        console.info(JSON.stringify({ event: "tv_recovery", ...event }));
      }
    },

    async invalidateCache() {
      if (options.cacheInvalidator) return options.cacheInvalidator();
      return "not_required_no_backend_tv_cache";
    },
  };
}

export function applyTvRecoveryPatchToSnapshot(
  station: TvRecoveryStation,
  patch: TvRecoveryPatch
) {
  return { ...station, ...patch } as TvRecoveryStation;
}
