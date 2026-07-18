/**
 * Canonical Sports match-card DTO — never includes playback/provider secrets.
 */

import {
  describeSportsPublicEventStatus,
  mapSportsPublicEventStatus,
  watchabilityFromPublicStatus,
} from "./publicStatus";
import type { SportsMatchCard } from "./types";

export type MatchCardParticipantInput = {
  id: string;
  type?: "team" | "athlete" | "other";
  name: string;
  shortName?: string | null;
  logoUrl?: string | null;
  side?: string | null;
  score?: string | number | null;
  winner?: boolean | null;
};

export type MatchCardInput = {
  id: string;
  slug?: string | null;
  sport: {
    id: string;
    slug: string;
    name: string;
    icon?: string | null;
  };
  competition?: {
    id: string;
    slug?: string | null;
    name: string;
    shortName?: string | null;
    logoUrl?: string | null;
    countryCode?: string | null;
  } | null;
  participants?: MatchCardParticipantInput[];
  fixtureStatus?: string | null;
  broadcastStatus?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  minute?: number | null;
  period?: string | null;
  metadata?: Record<string, unknown> | null;
  venue?: {
    name?: string | null;
    city?: string | null;
    countryCode?: string | null;
  } | null;
  artwork?: {
    thumbnailUrl?: string | null;
    posterUrl?: string | null;
  } | null;
  hasPlayableBroadcast?: boolean;
  hasReplay?: boolean;
  hasHighlights?: boolean;
  badges?: string[];
  now?: Date;
  startingSoonWindowMs?: number;
};

const LEAK_KEY =
  /url|token|secret|password|license|manifest|embed|hls|dash|stream|provider_external|source_url|encrypted|api[_-]?key|signed/i;

function normalizeSide(
  side?: string | null
): "home" | "away" | null {
  if (side === "home" || side === "away") return side;
  return null;
}

/** Strip accidental sensitive keys from a plain object (defensive). */
export function sanitizeSportsBrowsePayload<T>(value: T): T {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSportsBrowsePayload(item)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (LEAK_KEY.test(key)) continue;
    if (typeof child === "string") {
      if (
        /^(https?:\/\/|rtmp:\/\/|data:)/i.test(child) &&
        /(m3u8|mpd|\.m3u|embed|iframe|token=)/i.test(child)
      ) {
        continue;
      }
      if (/<iframe|<script|src=/i.test(child)) continue;
    }
    out[key] = sanitizeSportsBrowsePayload(child);
  }
  return out as T;
}

export function toSportsMatchCard(input: MatchCardInput): SportsMatchCard {
  const code = mapSportsPublicEventStatus({
    fixtureStatus: input.fixtureStatus,
    broadcastStatus: input.broadcastStatus,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    metadata: input.metadata,
    hasReplay: input.hasReplay,
    hasHighlights: input.hasHighlights,
    now: input.now,
    startingSoonWindowMs: input.startingSoonWindowMs,
  });
  const status = describeSportsPublicEventStatus(code);
  const watchability = watchabilityFromPublicStatus(code, {
    hasPlayableBroadcast: input.hasPlayableBroadcast,
    hasReplay: input.hasReplay,
    hasHighlights: input.hasHighlights,
  });

  // Starting Soon must never falsely claim playback.
  if (code === "starting_soon" || code === "scheduled") {
    watchability.playable = false;
    if (watchability.state === "watch") {
      watchability.state = "starting_soon";
    }
  }

  // Finished without replay/highlights is not Watch.
  if (status.finished && !input.hasReplay && !input.hasHighlights) {
    watchability.playable = false;
    watchability.state = "unavailable";
  }

  const card: SportsMatchCard = {
    id: input.id,
    slug: input.slug ?? null,
    sport: {
      id: input.sport.id,
      slug: input.sport.slug,
      name: input.sport.name,
      icon: input.sport.icon ?? null,
    },
    competition: input.competition
      ? {
          id: input.competition.id,
          slug: input.competition.slug ?? null,
          name: input.competition.name,
          shortName: input.competition.shortName ?? null,
          logoUrl: input.competition.logoUrl ?? null,
          countryCode: input.competition.countryCode ?? null,
        }
      : null,
    participants: (input.participants || []).map((p) => ({
      id: p.id,
      type: p.type || "other",
      name: p.name,
      shortName: p.shortName ?? null,
      logoUrl: p.logoUrl ?? null,
      side: normalizeSide(p.side),
      score: p.score ?? null,
      winner: p.winner ?? null,
    })),
    status,
    timing: {
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      minute: input.minute ?? null,
      period: input.period ?? metaPeriod(input.metadata),
    },
    venue: input.venue ?? null,
    artwork: input.artwork ?? null,
    watchability,
    badges: input.badges,
  };

  return sanitizeSportsBrowsePayload(card);
}

function metaPeriod(metadata?: Record<string, unknown> | null): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const period = metadata.period ?? metadata.stage;
  return typeof period === "string" ? period : null;
}

/** True when a payload accidentally contains playback/provider leak fields. */
export function sportsBrowsePayloadLeaksSecrets(
  value: unknown,
  path = ""
): string[] {
  const leaks: string[] = [];
  if (value == null) return leaks;
  if (typeof value === "string") {
    if (
      /^(https?:\/\/).+\.(m3u8|mpd)(\?|$)/i.test(value) ||
      /<iframe/i.test(value) ||
      /manifestUrl|embedHtml|source_url_encrypted/i.test(value)
    ) {
      leaks.push(path || "(string)");
    }
    return leaks;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      leaks.push(...sportsBrowsePayloadLeaksSecrets(item, `${path}[${i}]`));
    });
    return leaks;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const next = path ? `${path}.${key}` : key;
      if (LEAK_KEY.test(key)) leaks.push(next);
      leaks.push(...sportsBrowsePayloadLeaksSecrets(child, next));
    }
  }
  return leaks;
}
