/**
 * ScoreBat API / canonical types.
 */

export type ScoreBatTeam = {
  name: string;
  slug?: string;
  id?: number | string;
};

export type ScoreBatVideo = {
  id?: string;
  title: string;
  embed: string;
};

export type ScoreBatMatch = {
  title: string;
  competition: string;
  competitionUrl?: string;
  matchviewUrl?: string;
  thumbnail?: string;
  date: string;
  homeTeam?: ScoreBatTeam;
  awayTeam?: ScoreBatTeam;
  videos?: ScoreBatVideo[];
};

export type ScoreBatFeedResponse = {
  response?: ScoreBatMatch[];
};

export type ScoreBatVideoClass =
  | "live"
  | "starting_soon"
  | "highlights"
  | "replay"
  | "other";

export type ScoreBatLifecycleState =
  | "discovered"
  | "scheduled"
  | "starting_soon"
  | "playable"
  | "live"
  | "finished"
  | "highlights"
  | "replay"
  | "hibernating"
  | "expired";

export type CanonicalScoreBatMatch = {
  providerSlug: "scorebat";
  providerNativeId: string;
  canonicalKey: string;
  title: string;
  competitionName: string;
  competitionSlug: string | null;
  countryCode: string | null;
  homeTeam: {
    name: string;
    slug: string | null;
    externalId: string | null;
  } | null;
  awayTeam: {
    name: string;
    slug: string | null;
    externalId: string | null;
  } | null;
  startsAt: string;
  thumbnailUrl: string | null;
  videoClass: ScoreBatVideoClass;
  lifecycle: ScoreBatLifecycleState;
  primaryVideoId: string | null;
  /** Validated embed URL only — never raw HTML in browse DTOs. */
  embedUrl: string | null;
  videos: Array<{
    id: string | null;
    title: string;
    videoClass: ScoreBatVideoClass;
    embedUrl: string | null;
  }>;
  sourceUpdatedAt: string;
  isFixture: boolean;
  rejectReason?: string;
};
