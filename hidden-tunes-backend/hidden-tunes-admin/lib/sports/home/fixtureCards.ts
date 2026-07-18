/**
 * Shared fixture → match-card batching for home sections.
 * No playback resolution, no stream URL selection.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { toSportsMatchCard } from "./matchCard";
import type { SportsMatchCard } from "./types";

export type FixtureRow = {
  id: string;
  title: string;
  sport_id: string;
  competition_id: string | null;
  starts_at: string;
  ends_at: string | null;
  status: string;
  venue_id: string | null;
  country_code: string | null;
  metadata: Record<string, unknown> | null;
};

type SportRow = { id: string; slug: string; name: string; artwork_url?: string | null };
type CompetitionRow = {
  id: string;
  slug: string | null;
  name: string;
  short_name: string | null;
  artwork_url: string | null;
  country_code: string | null;
};
type VenueRow = {
  id: string;
  name: string;
  city: string | null;
  country_code: string | null;
};
type ParticipantRow = {
  id: string;
  fixture_id: string;
  team_id: string | null;
  athlete_id: string | null;
  side: string | null;
  metadata: Record<string, unknown> | null;
};
type TeamRow = {
  id: string;
  name: string;
  short_name: string | null;
  artwork_url: string | null;
};
type AthleteRow = {
  id: string;
  name: string;
  short_name: string | null;
  artwork_url: string | null;
};
type ScoreRow = {
  fixture_id: string;
  period: string;
  home_score: number | null;
  away_score: number | null;
};
type BroadcastHint = {
  fixture_id: string;
  availability_status: string;
  playable: boolean;
};

const PLAYABLE_SOURCE_STATUSES = [
  "verified",
  "scheduled",
  "live",
  "degraded",
  "external_only",
];

export async function batchLoadMatchCards(
  fixtures: FixtureRow[],
  opts: {
    now?: Date;
    startingSoonWindowMs?: number;
  } = {}
): Promise<SportsMatchCard[]> {
  if (!fixtures.length) return [];

  const fixtureIds = fixtures.map((f) => f.id);
  const sportIds = [...new Set(fixtures.map((f) => f.sport_id))];
  const competitionIds = [
    ...new Set(
      fixtures.map((f) => f.competition_id).filter(Boolean) as string[]
    ),
  ];
  const venueIds = [
    ...new Set(fixtures.map((f) => f.venue_id).filter(Boolean) as string[]),
  ];

  const [
    sportsRes,
    competitionsRes,
    venuesRes,
    participantsRes,
    scoresRes,
    broadcastsRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("sports")
      .select("id, slug, name, artwork_url")
      .in("id", sportIds),
    competitionIds.length
      ? supabaseAdmin
          .from("sports_competitions")
          .select("id, slug, name, short_name, artwork_url, country_code")
          .in("id", competitionIds)
      : Promise.resolve({ data: [] as CompetitionRow[], error: null }),
    venueIds.length
      ? supabaseAdmin
          .from("sports_venues")
          .select("id, name, city, country_code")
          .in("id", venueIds)
      : Promise.resolve({ data: [] as VenueRow[], error: null }),
    supabaseAdmin
      .from("sports_fixture_participants")
      .select("id, fixture_id, team_id, athlete_id, side, metadata")
      .in("fixture_id", fixtureIds),
    supabaseAdmin
      .from("sports_fixture_scores")
      .select("fixture_id, period, home_score, away_score")
      .in("fixture_id", fixtureIds)
      .eq("period", "full_time"),
    supabaseAdmin
      .from("sports_broadcasts")
      .select("id, fixture_id, availability_status")
      .in("fixture_id", fixtureIds)
      .not("published_at", "is", null)
      .is("unpublished_at", null)
      .is("quarantined_at", null),
  ]);

  if (sportsRes.error) throw new Error(sportsRes.error.message);
  if (competitionsRes.error) throw new Error(competitionsRes.error.message);
  if (venuesRes.error) throw new Error(venuesRes.error.message);
  if (participantsRes.error) throw new Error(participantsRes.error.message);
  if (scoresRes.error) throw new Error(scoresRes.error.message);
  if (broadcastsRes.error) throw new Error(broadcastsRes.error.message);

  const sports = new Map(
    ((sportsRes.data || []) as SportRow[]).map((s) => [s.id, s])
  );
  const competitions = new Map(
    ((competitionsRes.data || []) as CompetitionRow[]).map((c) => [c.id, c])
  );
  const venues = new Map(
    ((venuesRes.data || []) as VenueRow[]).map((v) => [v.id, v])
  );
  const participants = (participantsRes.data || []) as ParticipantRow[];
  const scores = new Map(
    ((scoresRes.data || []) as ScoreRow[]).map((s) => [s.fixture_id, s])
  );

  const broadcastIds = ((broadcastsRes.data || []) as Array<{
    id: string;
    fixture_id: string;
    availability_status: string;
  }>).map((b) => b.id);

  const playableByBroadcast = new Set<string>();
  if (broadcastIds.length) {
    const { data: sources, error: sourcesError } = await supabaseAdmin
      .from("sports_stream_sources")
      .select("broadcast_id, status, is_direct_play_allowed, is_embed_allowed, is_external_only")
      .in("broadcast_id", broadcastIds)
      .in("status", PLAYABLE_SOURCE_STATUSES);
    if (sourcesError) throw new Error(sourcesError.message);
    for (const src of sources || []) {
      if (
        src.is_direct_play_allowed ||
        src.is_embed_allowed ||
        src.is_external_only
      ) {
        playableByBroadcast.add(String(src.broadcast_id));
      }
    }
  }

  const broadcastHints = new Map<string, BroadcastHint>();
  for (const b of (broadcastsRes.data || []) as Array<{
    id: string;
    fixture_id: string;
    availability_status: string;
  }>) {
    const prev = broadcastHints.get(b.fixture_id);
    const playable = playableByBroadcast.has(b.id);
    if (!prev) {
      broadcastHints.set(b.fixture_id, {
        fixture_id: b.fixture_id,
        availability_status: b.availability_status,
        playable,
      });
    } else {
      prev.playable = prev.playable || playable;
      if (b.availability_status === "live") {
        prev.availability_status = "live";
      }
    }
  }

  const teamIds = [
    ...new Set(
      participants.map((p) => p.team_id).filter(Boolean) as string[]
    ),
  ];
  const athleteIds = [
    ...new Set(
      participants.map((p) => p.athlete_id).filter(Boolean) as string[]
    ),
  ];

  const [teamsRes, athletesRes, videosRes] = await Promise.all([
    teamIds.length
      ? supabaseAdmin
          .from("sports_teams")
          .select("id, name, short_name, artwork_url")
          .in("id", teamIds)
      : Promise.resolve({ data: [] as TeamRow[], error: null }),
    athleteIds.length
      ? supabaseAdmin
          .from("sports_athletes")
          .select("id, name, short_name, artwork_url")
          .in("id", athleteIds)
      : Promise.resolve({ data: [] as AthleteRow[], error: null }),
    supabaseAdmin
      .from("sports_videos")
      .select("fixture_id, video_type")
      .in("fixture_id", fixtureIds)
      .in("video_type", ["highlights", "replay"])
      .not("published_at", "is", null)
      .is("unpublished_at", null)
      .is("quarantined_at", null),
  ]);

  if (teamsRes.error) throw new Error(teamsRes.error.message);
  if (athletesRes.error) throw new Error(athletesRes.error.message);
  if (videosRes.error) throw new Error(videosRes.error.message);

  const teams = new Map(
    ((teamsRes.data || []) as TeamRow[]).map((t) => [t.id, t])
  );
  const athletes = new Map(
    ((athletesRes.data || []) as AthleteRow[]).map((a) => [a.id, a])
  );

  const videoFlags = new Map<
    string,
    { hasReplay: boolean; hasHighlights: boolean }
  >();
  for (const v of (videosRes.data || []) as Array<{
    fixture_id: string;
    video_type: string;
  }>) {
    const flags = videoFlags.get(v.fixture_id) || {
      hasReplay: false,
      hasHighlights: false,
    };
    if (v.video_type === "replay") flags.hasReplay = true;
    if (v.video_type === "highlights") flags.hasHighlights = true;
    videoFlags.set(v.fixture_id, flags);
  }

  const participantsByFixture = new Map<string, ParticipantRow[]>();
  for (const p of participants) {
    const list = participantsByFixture.get(p.fixture_id) || [];
    list.push(p);
    participantsByFixture.set(p.fixture_id, list);
  }

  return fixtures.map((fixture) => {
    const sport = sports.get(fixture.sport_id);
    const competition = fixture.competition_id
      ? competitions.get(fixture.competition_id)
      : null;
    const venue = fixture.venue_id ? venues.get(fixture.venue_id) : null;
    const score = scores.get(fixture.id);
    const hint = broadcastHints.get(fixture.id);
    const flags = videoFlags.get(fixture.id);

    const cardParticipants = (participantsByFixture.get(fixture.id) || []).map(
      (p) => {
        if (p.team_id && teams.has(p.team_id)) {
          const team = teams.get(p.team_id)!;
          const side = p.side === "home" || p.side === "away" ? p.side : null;
          let participantScore: string | number | null = null;
          if (score && side === "home") participantScore = score.home_score;
          if (score && side === "away") participantScore = score.away_score;
          return {
            id: team.id,
            type: "team" as const,
            name: team.name,
            shortName: team.short_name,
            logoUrl: team.artwork_url,
            side,
            score: participantScore,
            winner: null,
          };
        }
        if (p.athlete_id && athletes.has(p.athlete_id)) {
          const athlete = athletes.get(p.athlete_id)!;
          return {
            id: athlete.id,
            type: "athlete" as const,
            name: athlete.name,
            shortName: athlete.short_name,
            logoUrl: athlete.artwork_url,
            side: p.side === "home" || p.side === "away" ? p.side : null,
            score: null,
            winner: null,
          };
        }
        return {
          id: p.id,
          type: "other" as const,
          name: fixture.title,
          shortName: null,
          logoUrl: null,
          side: p.side === "home" || p.side === "away" ? p.side : null,
          score: null,
          winner: null,
        };
      }
    );

    const meta = (fixture.metadata || {}) as Record<string, unknown>;
    const badges: string[] = [];
    if (meta.featured === true || meta.is_featured === true) {
      badges.push("featured");
    }

    return toSportsMatchCard({
      id: fixture.id,
      slug: typeof meta.slug === "string" ? meta.slug : null,
      sport: {
        id: sport?.id || fixture.sport_id,
        slug: sport?.slug || "unknown",
        name: sport?.name || "Sport",
        icon: sport?.artwork_url ?? null,
      },
      competition: competition
        ? {
            id: competition.id,
            slug: competition.slug,
            name: competition.name,
            shortName: competition.short_name,
            logoUrl: competition.artwork_url,
            countryCode: competition.country_code,
          }
        : null,
      participants: cardParticipants,
      fixtureStatus: fixture.status,
      broadcastStatus: hint?.availability_status,
      startsAt: fixture.starts_at,
      endsAt: fixture.ends_at,
      metadata: meta,
      venue: venue
        ? {
            name: venue.name,
            city: venue.city,
            countryCode: venue.country_code,
          }
        : fixture.country_code
          ? { name: null, city: null, countryCode: fixture.country_code }
          : null,
      artwork: {
        thumbnailUrl: competition?.artwork_url ?? sport?.artwork_url ?? null,
        posterUrl: competition?.artwork_url ?? null,
      },
      hasPlayableBroadcast: Boolean(hint?.playable),
      hasReplay: Boolean(flags?.hasReplay),
      hasHighlights: Boolean(flags?.hasHighlights),
      badges: badges.length ? badges : undefined,
      now: opts.now,
      startingSoonWindowMs: opts.startingSoonWindowMs,
    });
  });
}

export function isFeaturedFixture(fixture: FixtureRow): boolean {
  const meta = (fixture.metadata || {}) as Record<string, unknown>;
  if (meta.featured === true || meta.is_featured === true) return true;
  const priority = Number(meta.priority ?? meta.editorial_rank);
  return Number.isFinite(priority) && priority > 0 && priority <= 100;
}

export function featuredPriority(fixture: FixtureRow): number {
  const meta = (fixture.metadata || {}) as Record<string, unknown>;
  const priority = Number(meta.priority ?? meta.editorial_rank ?? 500);
  return Number.isFinite(priority) ? priority : 500;
}

/** Curated competition-type rank (stable, not random). */
export const COMPETITION_TYPE_RANK: Record<string, number> = {
  olympic: 10,
  world_cup: 20,
  championship: 30,
  tournament: 40,
  cup: 50,
  league: 60,
  grand_prix: 70,
  series: 80,
  fight_card: 90,
  friendly: 100,
  esports: 110,
  other: 120,
};
