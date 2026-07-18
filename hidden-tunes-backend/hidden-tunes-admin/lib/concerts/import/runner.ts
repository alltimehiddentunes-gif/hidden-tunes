/**
 * Checkpointed Concerts import runner.
 * Discovers broadly from eligible sources; inserts only as validation_pending.
 * Never publishes publicly. Bounded per run; resumable across runs.
 */

import path from "path";
import { fileURLToPath } from "url";

import { getKnownConcertYouTubeChannelId } from "../providers/channelIdentityMap";
import {
  discoverYouTubeChannelPage,
  hasConcertYouTubeApiKey,
  resolveYouTubeChannelIdForHandle,
  type ConcertYouTubeVideoCandidate,
} from "../providers/youtubeClient";
import { isValidYouTubeChannelId } from "../providers/youtubeOfficial";
import { normalizeYouTubeChannelUrl } from "../providers/youtubeOfficial";
import type { ConcertSourceSeed } from "../types";
import { classifyConcertCandidate } from "./classify";
import {
  createConcertImportCheckpoint,
  loadConcertImportCheckpoint,
  writeConcertImportCheckpoint,
  type ConcertImportCheckpoint,
} from "./checkpoint";
import { insertPendingConcertCandidate } from "./persistPending";
import { probeYouTubeConcertPlayability } from "./playbackProbe";
import { isConcertSourceImportEligible } from "./sourceEligibility";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CONCERTS_ADMIN_ROOT = path.resolve(__dirname, "../../..");

export type ConcertImportRunOptions = {
  sources: ConcertSourceSeed[];
  sourceStableKey?: string;
  maxPagesPerSource?: number;
  pageSize?: number;
  dryRun?: boolean;
  resume?: boolean;
  skipPlaybackProbe?: boolean;
  fixtures?: Record<string, ConcertYouTubeVideoCandidate[]>;
  adminRoot?: string;
  onProgress?: (event: Record<string, unknown>) => void;
};

export type ConcertImportSourceReport = {
  stableKey: string;
  eligible: boolean;
  channelId: string | null;
  pages: number;
  seen: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  inserted: number;
  probeFailed: number;
  errors: string[];
  checkpoint: ConcertImportCheckpoint;
};

export type ConcertImportRunReport = {
  generated_at: string;
  dry_run: boolean;
  youtube_api_key_present: boolean;
  sources_considered: number;
  sources_eligible: number;
  sources_run: number;
  totals: {
    seen: number;
    accepted: number;
    rejected: number;
    duplicates: number;
    inserted: number;
    probe_failed: number;
  };
  sources: ConcertImportSourceReport[];
};

function extractHandle(mediaChannelUrl: string): string | null {
  const normalized = normalizeYouTubeChannelUrl(mediaChannelUrl) || mediaChannelUrl;
  try {
    const url = new URL(normalized);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0]?.startsWith("@")) return parts[0].slice(1);
    if (parts[0] === "channel" && parts[1]) return parts[1];
    return null;
  } catch {
    return null;
  }
}

async function resolveChannelId(source: ConcertSourceSeed): Promise<string | null> {
  if (source.providerChannelId && isValidYouTubeChannelId(source.providerChannelId)) {
    return source.providerChannelId;
  }
  const known = getKnownConcertYouTubeChannelId(source.stableKey);
  if (known) return known;

  const handleOrId = extractHandle(source.mediaChannelUrl);
  if (handleOrId && isValidYouTubeChannelId(handleOrId)) return handleOrId;
  if (handleOrId && hasConcertYouTubeApiKey()) {
    return resolveYouTubeChannelIdForHandle(handleOrId);
  }
  return null;
}

export async function runConcertsImport(
  options: ConcertImportRunOptions
): Promise<ConcertImportRunReport> {
  const adminRoot = options.adminRoot || CONCERTS_ADMIN_ROOT;
  const dryRun = Boolean(options.dryRun);
  const maxPages = Math.max(1, options.maxPagesPerSource ?? 2);
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 25));
  const resume = options.resume !== false;

  const selected = options.sourceStableKey
    ? options.sources.filter((s) => s.stableKey === options.sourceStableKey)
    : options.sources;

  const eligible = selected.filter(isConcertSourceImportEligible);
  const reports: ConcertImportSourceReport[] = [];

  for (const source of selected) {
    const checkpoint =
      (resume && loadConcertImportCheckpoint(adminRoot, source.stableKey)) ||
      createConcertImportCheckpoint(source.stableKey);

    if (!isConcertSourceImportEligible(source)) {
      checkpoint.status = "completed";
      checkpoint.last_error = "source_not_import_eligible";
      writeConcertImportCheckpoint(adminRoot, checkpoint);
      reports.push({
        stableKey: source.stableKey,
        eligible: false,
        channelId: null,
        pages: 0,
        seen: 0,
        accepted: 0,
        rejected: 0,
        duplicates: 0,
        inserted: 0,
        probeFailed: 0,
        errors: ["source_not_import_eligible"],
        checkpoint,
      });
      continue;
    }

    const sourceReport: ConcertImportSourceReport = {
      stableKey: source.stableKey,
      eligible: true,
      channelId: null,
      pages: 0,
      seen: 0,
      accepted: 0,
      rejected: 0,
      duplicates: 0,
      inserted: 0,
      probeFailed: 0,
      errors: [],
      checkpoint,
    };

    try {
      checkpoint.status = "running";
      const channelId = await resolveChannelId(source);
      sourceReport.channelId = channelId;
      checkpoint.channel_id = channelId;
      if (!channelId) {
        throw new Error("channel_id_unresolved");
      }

      let pageToken: string | null = resume ? checkpoint.page_token : null;
      let pagesThisRun = 0;

      while (pagesThisRun < maxPages) {
        let candidates: ConcertYouTubeVideoCandidate[] = [];
        let nextPageToken: string | null = null;

        if (options.fixtures?.[source.stableKey]) {
          candidates = options.fixtures[source.stableKey];
          nextPageToken = null;
        } else {
          if (!hasConcertYouTubeApiKey()) {
            throw new Error("youtube_api_key_missing");
          }
          const page = await discoverYouTubeChannelPage({
            channelId,
            pageToken,
            maxResults: pageSize,
          });
          candidates = page.candidates;
          nextPageToken = page.nextPageToken;
          checkpoint.uploads_playlist_id = page.uploadsPlaylistId;
        }

        pagesThisRun += 1;
        sourceReport.pages += 1;
        checkpoint.pages_processed += 1;

        for (const candidate of candidates) {
          sourceReport.seen += 1;
          checkpoint.candidates_seen += 1;

          const classification = classifyConcertCandidate(candidate);
          if (classification.decision !== "accept_candidate") {
            sourceReport.rejected += 1;
            checkpoint.rejected += 1;
            continue;
          }

          if (!options.skipPlaybackProbe) {
            const probe = await probeYouTubeConcertPlayability(candidate);
            if (!probe.ok) {
              sourceReport.probeFailed += 1;
              sourceReport.rejected += 1;
              checkpoint.rejected += 1;
              continue;
            }
          }

          sourceReport.accepted += 1;
          checkpoint.accepted += 1;

          if (dryRun) continue;

          // Source UUID is required for DB insert; caller/seed must upsert sources first.
          // When source_id is unknown, skip insert and record error once.
          if (!checkpoint.source_id) {
            sourceReport.errors.push("source_id_missing_upsert_sources_first");
            continue;
          }

          const result = await insertPendingConcertCandidate({
            sourceId: checkpoint.source_id,
            candidate,
            classification,
            countryCode: source.countryCode,
            languageCode: source.languageCodes[0] || null,
          });

          if (result.duplicate) {
            sourceReport.duplicates += 1;
            checkpoint.duplicates += 1;
          } else if (result.inserted) {
            sourceReport.inserted += 1;
            checkpoint.inserted += 1;
          }
        }

        pageToken = nextPageToken;
        checkpoint.page_token = nextPageToken;
        writeConcertImportCheckpoint(adminRoot, checkpoint);
        options.onProgress?.({
          type: "page",
          source: source.stableKey,
          pagesThisRun,
          seen: sourceReport.seen,
          accepted: sourceReport.accepted,
          nextPageToken,
        });

        if (!nextPageToken) {
          checkpoint.status = "completed";
          break;
        }
      }

      if (checkpoint.status === "running") {
        checkpoint.status = pageToken ? "paused" : "completed";
      }
      writeConcertImportCheckpoint(adminRoot, checkpoint);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sourceReport.errors.push(message);
      checkpoint.status = "failed";
      checkpoint.last_error = message;
      writeConcertImportCheckpoint(adminRoot, checkpoint);
    }

    sourceReport.checkpoint = checkpoint;
    reports.push(sourceReport);
  }

  const totals = reports.reduce(
    (acc, row) => {
      acc.seen += row.seen;
      acc.accepted += row.accepted;
      acc.rejected += row.rejected;
      acc.duplicates += row.duplicates;
      acc.inserted += row.inserted;
      acc.probe_failed += row.probeFailed;
      return acc;
    },
    {
      seen: 0,
      accepted: 0,
      rejected: 0,
      duplicates: 0,
      inserted: 0,
      probe_failed: 0,
    }
  );

  return {
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    youtube_api_key_present: hasConcertYouTubeApiKey(),
    sources_considered: selected.length,
    sources_eligible: eligible.length,
    sources_run: reports.filter((r) => r.eligible).length,
    totals,
    sources: reports,
  };
}
