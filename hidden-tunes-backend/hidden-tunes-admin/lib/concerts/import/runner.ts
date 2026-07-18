/**
 * Checkpointed Concerts import runner (Phase 5 scale-hardened).
 * Source-level failure isolation, rejection memory, soft dedupe, bounded pages.
 * Never publishes publicly.
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
import {
  buildConcertMetadataHash,
  buildConcertPerformanceFingerprint,
  buildHardProviderKey,
  scoreConcertSoftDuplicate,
} from "./dedupe";
import { inferLifecycleHint } from "./lifecycle";
import { insertPendingConcertCandidate } from "./persistPending";
import { probeYouTubeConcertPlayability } from "./playbackProbe";
import {
  createRequestDeduper,
  decideConcertProviderRetry,
} from "./rateLimit";
import {
  mapClassificationToRejectionCode,
  shouldSkipRejectedConcert,
  type ConcertRejectionRecord,
} from "./rejectionMemory";
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
  rejectionMemory?: Map<string, ConcertRejectionRecord>;
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
  probableDuplicates: number;
  skippedRejections: number;
  inserted: number;
  probeFailed: number;
  retries: number;
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
  sources_failed: number;
  totals: {
    seen: number;
    accepted: number;
    rejected: number;
    duplicates: number;
    probable_duplicates: number;
    skipped_rejections: number;
    inserted: number;
    probe_failed: number;
    retries: number;
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runConcertsImport(
  options: ConcertImportRunOptions
): Promise<ConcertImportRunReport> {
  const adminRoot = options.adminRoot || CONCERTS_ADMIN_ROOT;
  const dryRun = Boolean(options.dryRun);
  const maxPages = Math.max(1, options.maxPagesPerSource ?? 2);
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 25));
  const resume = options.resume !== false;
  const rejectionMemory =
    options.rejectionMemory || new Map<string, ConcertRejectionRecord>();
  const requestDedupe = createRequestDeduper<Awaited<
    ReturnType<typeof discoverYouTubeChannelPage>
  >>();

  const selected = options.sourceStableKey
    ? options.sources.filter((s) => s.stableKey === options.sourceStableKey)
    : options.sources;

  const eligible = selected.filter(isConcertSourceImportEligible);
  const reports: ConcertImportSourceReport[] = [];
  const seenProviderKeys = new Set<string>();
  const fingerprintIndex = new Map<string, string>();
  const softSeen: Array<{
    id: string;
    title: string;
    primaryArtistName: string;
    providerContentId: string;
    durationSeconds: number | null;
    performanceDate: string | null;
    lifecycleHint: "scheduled" | "live" | "replay" | "unknown";
    performanceFingerprint: string;
  }> = [];

  for (const source of selected) {
    const checkpoint =
      (resume && loadConcertImportCheckpoint(adminRoot, source.stableKey)) ||
      createConcertImportCheckpoint(source.stableKey);

    const sourceReport: ConcertImportSourceReport = {
      stableKey: source.stableKey,
      eligible: isConcertSourceImportEligible(source),
      channelId: null,
      pages: 0,
      seen: 0,
      accepted: 0,
      rejected: 0,
      duplicates: 0,
      probableDuplicates: 0,
      skippedRejections: 0,
      inserted: 0,
      probeFailed: 0,
      retries: 0,
      errors: [],
      checkpoint,
    };

    if (!sourceReport.eligible) {
      checkpoint.status = "completed";
      checkpoint.last_error = "source_not_import_eligible";
      writeConcertImportCheckpoint(adminRoot, checkpoint);
      sourceReport.errors.push("source_not_import_eligible");
      sourceReport.checkpoint = checkpoint;
      reports.push(sourceReport);
      continue;
    }

    try {
      checkpoint.status = "running";
      const channelId = await resolveChannelId(source);
      sourceReport.channelId = channelId;
      checkpoint.channel_id = channelId;
      if (!channelId) throw new Error("channel_id_unresolved");

      let pageToken: string | null = resume ? checkpoint.page_token : null;
      let pagesThisRun = 0;

      while (pagesThisRun < maxPages) {
        let candidates: ConcertYouTubeVideoCandidate[] = [];
        let nextPageToken: string | null = null;

        if (options.fixtures?.[source.stableKey]) {
          // Memory-bounded: only one fixture page per source per run.
          candidates =
            pagesThisRun === 0 ? options.fixtures[source.stableKey] : [];
          nextPageToken = null;
        } else {
          if (!hasConcertYouTubeApiKey()) {
            throw new Error("youtube_api_key_missing");
          }

          let attempt = 0;
          // Provider retry with backoff; failure stays isolated to this source.
          // eslint-disable-next-line no-constant-condition
          while (true) {
            try {
              const cacheKey = `${channelId}:${pageToken || "start"}:${pageSize}`;
              const page = await requestDedupe(cacheKey, () =>
                discoverYouTubeChannelPage({
                  channelId,
                  pageToken,
                  maxResults: pageSize,
                })
              );
              candidates = page.candidates;
              nextPageToken = page.nextPageToken;
              checkpoint.uploads_playlist_id = page.uploadsPlaylistId;
              break;
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              const statusMatch = message.match(/YouTube API (\d+)/);
              const decision = decideConcertProviderRetry({
                attempt,
                status: statusMatch ? Number(statusMatch[1]) : null,
                errorMessage: message,
              });
              if (!decision.retry) throw error;
              sourceReport.retries += 1;
              attempt += 1;
              await sleep(decision.delayMs);
            }
          }
        }

        pagesThisRun += 1;
        sourceReport.pages += 1;
        checkpoint.pages_processed += 1;

        for (const candidate of candidates) {
          sourceReport.seen += 1;
          checkpoint.candidates_seen += 1;

          const hardKey = buildHardProviderKey("youtube", candidate.providerContentId);
          if (seenProviderKeys.has(hardKey)) {
            sourceReport.duplicates += 1;
            checkpoint.duplicates += 1;
            continue;
          }
          seenProviderKeys.add(hardKey);

          const metadataHash = buildConcertMetadataHash({
            title: candidate.title,
            description: candidate.description,
            duration: candidate.durationSeconds,
            embeddable: candidate.embeddable,
            live: candidate.liveBroadcastContent,
          });

          const rejectionKey = hardKey;
          const priorRejection = rejectionMemory.get(rejectionKey);
          if (priorRejection) {
            const skip = shouldSkipRejectedConcert({
              rejection: priorRejection,
              currentMetadataHash: metadataHash,
              currentEmbedStatus: String(candidate.embeddable),
            });
            if (skip.skip) {
              sourceReport.skippedRejections += 1;
              continue;
            }
          }

          const classification = classifyConcertCandidate(candidate);
          if (classification.decision !== "accept_candidate") {
            sourceReport.rejected += 1;
            checkpoint.rejected += 1;
            const code =
              classification.rejectionCode ||
              mapClassificationToRejectionCode(
                classification.decision,
                candidate.title,
                candidate.description
              );
            rejectionMemory.set(rejectionKey, {
              provider: "youtube",
              providerContentId: candidate.providerContentId,
              reasonCode: code,
              metadataHash,
              embedStatus: String(candidate.embeddable),
              lastSeenAt: new Date().toISOString(),
            });
            continue;
          }

          const lifecycleHint = inferLifecycleHint({
            liveBroadcastContent: candidate.liveBroadcastContent,
            isLive: classification.isLive,
            isUpcoming: classification.isUpcoming,
            isReplay: classification.isReplay,
          });
          const fingerprint = buildConcertPerformanceFingerprint({
            title: candidate.title,
            primaryArtistName: candidate.channelTitle,
            performanceDate: candidate.publishedAt,
            durationSeconds: candidate.durationSeconds,
            providerChannelId: candidate.channelId,
            lifecycleHint,
          });

          // Soft duplicate scan against in-run memory (bounded; no full catalog load).
          let skipAsDuplicate = false;
          for (const prior of softSeen) {
            const soft = scoreConcertSoftDuplicate(
              {
                id: "incoming",
                title: candidate.title,
                primaryArtistName: candidate.channelTitle,
                providerContentId: candidate.providerContentId,
                durationSeconds: candidate.durationSeconds,
                performanceDate: candidate.publishedAt,
                lifecycleHint,
                performanceFingerprint: fingerprint,
              },
              prior
            );
            if (soft.autoMerge) {
              sourceReport.duplicates += 1;
              checkpoint.duplicates += 1;
              skipAsDuplicate = true;
              break;
            }
            if (soft.kind === "probable_duplicate") {
              sourceReport.probableDuplicates += 1;
            }
          }
          if (skipAsDuplicate) continue;

          if (!options.skipPlaybackProbe) {
            const probe = await probeYouTubeConcertPlayability(candidate);
            if (!probe.ok) {
              sourceReport.probeFailed += 1;
              sourceReport.rejected += 1;
              checkpoint.rejected += 1;
              rejectionMemory.set(rejectionKey, {
                provider: "youtube",
                providerContentId: candidate.providerContentId,
                reasonCode: "dead",
                metadataHash,
                embedStatus: String(candidate.embeddable),
                lastSeenAt: new Date().toISOString(),
              });
              continue;
            }
          }

          sourceReport.accepted += 1;
          checkpoint.accepted += 1;
          softSeen.push({
            id: candidate.providerContentId,
            title: candidate.title,
            primaryArtistName: candidate.channelTitle,
            providerContentId: candidate.providerContentId,
            durationSeconds: candidate.durationSeconds,
            performanceDate: candidate.publishedAt,
            lifecycleHint,
            performanceFingerprint: fingerprint,
          });

          if (dryRun) continue;

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
            existingFingerprintIndex: fingerprintIndex,
          });

          if (result.duplicate || result.probableDuplicate) {
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
      // Continue other sources — one broken source must not stop the run.
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
      acc.probable_duplicates += row.probableDuplicates;
      acc.skipped_rejections += row.skippedRejections;
      acc.inserted += row.inserted;
      acc.probe_failed += row.probeFailed;
      acc.retries += row.retries;
      return acc;
    },
    {
      seen: 0,
      accepted: 0,
      rejected: 0,
      duplicates: 0,
      probable_duplicates: 0,
      skipped_rejections: 0,
      inserted: 0,
      probe_failed: 0,
      retries: 0,
    }
  );

  return {
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    youtube_api_key_present: hasConcertYouTubeApiKey(),
    sources_considered: selected.length,
    sources_eligible: eligible.length,
    sources_run: reports.filter((r) => r.eligible).length,
    sources_failed: reports.filter((r) => r.errors.length > 0 && r.eligible).length,
    totals,
    sources: reports,
  };
}
