/**
 * Resolve and verify official YouTube channel identities for curated sources.
 * Rejects ambiguous / fan / topic matches. Does not invent IDs.
 */

import type { ConcertSourceSeed } from "../types";
import { getKnownConcertYouTubeChannelId } from "../providers/channelIdentityMap";
import {
  fetchYouTubeChannelSnippet,
  hasConcertYouTubeApiKey,
  resolveYouTubeChannelForHandle,
} from "../providers/youtubeClient";
import {
  isValidYouTubeChannelId,
  normalizeYouTubeChannelUrl,
} from "../providers/youtubeOfficial";
import { isConcertSourceImportEligible } from "../import/sourceEligibility";

export type ConcertIdentityResolutionStatus =
  | "resolved"
  | "already_resolved"
  | "ambiguous"
  | "not_found"
  | "wrong_owner"
  | "unsupported_provider"
  | "eligible_for_import"
  | "temporarily_blocked";

export type ConcertIdentityResolutionRow = {
  stableKey: string;
  status: ConcertIdentityResolutionStatus;
  channelId: string | null;
  handle: string | null;
  ownerExpected: string;
  channelTitle: string | null;
  eligibleForImport: boolean;
  temporarilyBlocked: boolean;
  reason: string;
};

function extractHandle(mediaChannelUrl: string): string | null {
  const normalized = normalizeYouTubeChannelUrl(mediaChannelUrl) || mediaChannelUrl;
  try {
    const url = new URL(normalized);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0]?.startsWith("@")) return parts[0].slice(1);
    if (parts[0] === "channel" && isValidYouTubeChannelId(parts[1])) return null;
    return null;
  } catch {
    return null;
  }
}

function looksLikeTopicOrFanChannel(title: string | null, owner: string): boolean {
  const t = String(title || "").toLowerCase();
  const o = String(owner || "").toLowerCase();
  if (!t) return false;
  if (/\btopic\b/.test(t)) return true;
  if (/\bfan\b|\bfans?\b|\bunofficial\b|\btribute\b/.test(t) && !t.includes(o.split(" ")[0] || "___")) {
    return true;
  }
  return false;
}

function ownerMatches(channelTitle: string | null, owner: string, sourceName: string): boolean {
  if (!channelTitle) return true; // cannot prove wrong without title
  const title = channelTitle.toLowerCase();
  const needles = [owner, sourceName]
    .flatMap((value) => String(value).toLowerCase().split(/[^a-z0-9]+/))
    .filter((token) => token.length >= 4);
  if (needles.length === 0) return true;
  return needles.some((token) => title.includes(token));
}

export async function resolveConcertSourceIdentities(
  sources: ConcertSourceSeed[],
  options?: { apiKeyPresent?: boolean }
): Promise<{
  rows: ConcertIdentityResolutionRow[];
  summary: Record<string, number>;
}> {
  const apiPresent =
    options?.apiKeyPresent ?? hasConcertYouTubeApiKey();
  const rows: ConcertIdentityResolutionRow[] = [];

  for (const source of sources) {
    const eligible = isConcertSourceImportEligible(source);
    const handle = extractHandle(source.mediaChannelUrl);
    const known = getKnownConcertYouTubeChannelId(source.stableKey);
    const seeded =
      source.providerChannelId && isValidYouTubeChannelId(source.providerChannelId)
        ? source.providerChannelId
        : null;

    if (source.provider !== "youtube") {
      rows.push({
        stableKey: source.stableKey,
        status: "unsupported_provider",
        channelId: null,
        handle,
        ownerExpected: source.sourceOwner,
        channelTitle: null,
        eligibleForImport: eligible,
        temporarilyBlocked: false,
        reason:
          "Non-YouTube provider — identity resolution uses provider-specific paths; not disabled solely for lacking YouTube ID",
      });
      continue;
    }

    if (seeded || known) {
      const channelId = (seeded || known) as string;
      let channelTitle: string | null = null;
      if (apiPresent) {
        try {
          const snippet = await fetchYouTubeChannelSnippet(channelId);
          channelTitle = snippet?.channelTitle || null;
          if (
            channelTitle &&
            looksLikeTopicOrFanChannel(channelTitle, source.sourceOwner)
          ) {
            rows.push({
              stableKey: source.stableKey,
              status: "wrong_owner",
              channelId: null,
              handle,
              ownerExpected: source.sourceOwner,
              channelTitle,
              eligibleForImport: eligible,
              temporarilyBlocked: true,
              reason: "topic_or_fan_channel_rejected",
            });
            continue;
          }
          if (
            channelTitle &&
            !ownerMatches(channelTitle, source.sourceOwner, source.name)
          ) {
            rows.push({
              stableKey: source.stableKey,
              status: "ambiguous",
              channelId: null,
              handle,
              ownerExpected: source.sourceOwner,
              channelTitle,
              eligibleForImport: eligible,
              temporarilyBlocked: true,
              reason: "channel_title_does_not_match_expected_owner",
            });
            continue;
          }
        } catch {
          // Ownership re-check is best-effort; keep already-resolved ID.
        }
      }
      rows.push({
        stableKey: source.stableKey,
        status: "already_resolved",
        channelId,
        handle,
        ownerExpected: source.sourceOwner,
        channelTitle,
        eligibleForImport: eligible,
        temporarilyBlocked: false,
        reason: seeded
          ? "seed_or_prior_canonical_id"
          : "known_verified_map",
      });
      continue;
    }

    if (!apiPresent) {
      rows.push({
        stableKey: source.stableKey,
        status: "temporarily_blocked",
        channelId: null,
        handle,
        ownerExpected: source.sourceOwner,
        channelTitle: null,
        eligibleForImport: eligible,
        temporarilyBlocked: true,
        reason: "YOUTUBE_API_KEY missing — cannot resolve canonical UC ID without inventing",
      });
      continue;
    }

    if (!handle) {
      rows.push({
        stableKey: source.stableKey,
        status: "not_found",
        channelId: null,
        handle: null,
        ownerExpected: source.sourceOwner,
        channelTitle: null,
        eligibleForImport: eligible,
        temporarilyBlocked: true,
        reason: "No handle or canonical ID available to resolve",
      });
      continue;
    }

    try {
      const resolved = await resolveYouTubeChannelForHandle(handle);
      if (!resolved) {
        rows.push({
          stableKey: source.stableKey,
          status: "not_found",
          channelId: null,
          handle,
          ownerExpected: source.sourceOwner,
          channelTitle: null,
          eligibleForImport: eligible,
          temporarilyBlocked: true,
          reason: "YouTube forHandle returned no channel",
        });
        continue;
      }

      if (
        resolved.channelTitle &&
        looksLikeTopicOrFanChannel(resolved.channelTitle, source.sourceOwner)
      ) {
        rows.push({
          stableKey: source.stableKey,
          status: "wrong_owner",
          channelId: null,
          handle,
          ownerExpected: source.sourceOwner,
          channelTitle: resolved.channelTitle,
          eligibleForImport: eligible,
          temporarilyBlocked: true,
          reason: "topic_or_fan_channel_rejected",
        });
        continue;
      }

      if (
        resolved.channelTitle &&
        !ownerMatches(resolved.channelTitle, source.sourceOwner, source.name)
      ) {
        rows.push({
          stableKey: source.stableKey,
          status: "ambiguous",
          channelId: null,
          handle,
          ownerExpected: source.sourceOwner,
          channelTitle: resolved.channelTitle,
          eligibleForImport: eligible,
          temporarilyBlocked: true,
          reason: "channel_title_does_not_match_expected_owner",
        });
        continue;
      }

      rows.push({
        stableKey: source.stableKey,
        status: "resolved",
        channelId: resolved.channelId,
        handle,
        ownerExpected: source.sourceOwner,
        channelTitle: resolved.channelTitle,
        eligibleForImport: eligible,
        temporarilyBlocked: false,
        reason: "resolved_via_youtube_forHandle",
      });
    } catch (error) {
      rows.push({
        stableKey: source.stableKey,
        status: "temporarily_blocked",
        channelId: null,
        handle,
        ownerExpected: source.sourceOwner,
        channelTitle: null,
        eligibleForImport: eligible,
        temporarilyBlocked: true,
        reason: error instanceof Error ? error.message : "resolve_failed",
      });
    }
  }

  // Enrichment helper for tests / future snippet verification
  for (const row of rows) {
    if (
      row.channelTitle &&
      looksLikeTopicOrFanChannel(row.channelTitle, row.ownerExpected)
    ) {
      row.status = "wrong_owner";
      row.temporarilyBlocked = true;
      row.reason = "topic_or_fan_channel_rejected";
      row.channelId = null;
    } else if (
      row.channelTitle &&
      !ownerMatches(row.channelTitle, row.ownerExpected, row.stableKey)
    ) {
      row.status = "ambiguous";
      row.temporarilyBlocked = true;
      row.reason = "channel_title_does_not_match_expected_owner";
    }
  }

  const summary: Record<string, number> = {};
  for (const row of rows) {
    summary[row.status] = (summary[row.status] || 0) + 1;
  }
  summary.eligible_for_import = rows.filter((r) => r.eligibleForImport).length;

  return { rows, summary };
}

export function applyResolvedIdentitiesToChannelMap(
  rows: ConcertIdentityResolutionRow[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    if (
      (row.status === "resolved" || row.status === "already_resolved") &&
      row.channelId &&
      isValidYouTubeChannelId(row.channelId)
    ) {
      out[row.stableKey] = row.channelId;
    }
  }
  return out;
}

export { looksLikeTopicOrFanChannel, ownerMatches };
