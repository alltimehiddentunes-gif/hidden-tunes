/**
 * Bounded high-confidence official sources for the live-embed pilot.
 * Only organizations with clear ownership and YouTube embeds.
 */

export type PilotOfficialSource = {
  id: string;
  organization: string;
  sourceType:
    | "federation"
    | "league"
    | "tournament"
    | "continental_confederation"
    | "official_promoter";
  sport: string;
  country: string | null;
  language: string;
  youtubeChannelId: string;
  officialPageUrl: string;
  approvalEvidence: string;
  approvalStatus: "approved_embed";
  commercialAppUse: true;
  embeddingAllowed: true;
  revoked: false;
};

/** First small high-confidence set — expand only after playback proof. */
export const PILOT_APPROVED_EMBED_SOURCES: readonly PilotOfficialSource[] = [
  {
    id: "yt-fiba-basketball",
    organization: "FIBA Basketball",
    sourceType: "federation",
    sport: "basketball",
    country: null,
    language: "en",
    youtubeChannelId: "UCtInrnU3QbWqFGsdKT1GZtg",
    officialPageUrl: "https://www.fiba.basketball/",
    approvalEvidence:
      "Official FIBA YouTube channel; federation ownership clear; public embeddable live tournament streams",
    approvalStatus: "approved_embed",
    commercialAppUse: true,
    embeddingAllowed: true,
    revoked: false,
  },
  {
    id: "yt-fiba-3x3",
    organization: "FIBA 3x3",
    sourceType: "federation",
    sport: "basketball",
    country: null,
    language: "en",
    youtubeChannelId: "UC7LpyJP5fupiJu2CdzRQheg",
    officialPageUrl: "https://fiba3x3.com/",
    approvalEvidence:
      "Official FIBA 3x3 YouTube channel; federation series live streams published for public viewing",
    approvalStatus: "approved_embed",
    commercialAppUse: true,
    embeddingAllowed: true,
    revoked: false,
  },
  {
    id: "yt-world-surf-league",
    organization: "World Surf League",
    sourceType: "league",
    sport: "surfing",
    country: null,
    language: "en",
    youtubeChannelId: "UChuLeaTGRcfzo0UjL-2qSbQ",
    officialPageUrl: "https://www.worldsurfleague.com/",
    approvalEvidence:
      "Official World Surf League YouTube; league-owned Challenger Series live finals coverage",
    approvalStatus: "approved_embed",
    commercialAppUse: true,
    embeddingAllowed: true,
    revoked: false,
  },
  {
    id: "yt-afl",
    organization: "AFL",
    sourceType: "league",
    sport: "australian_football",
    country: "AU",
    language: "en",
    youtubeChannelId: "UCxAeHdLDAatFV_vt95MSO-g",
    officialPageUrl: "https://www.afl.com.au/",
    approvalEvidence:
      "Official Australian Football League YouTube; league-published watchalong with match vision",
    approvalStatus: "approved_embed",
    commercialAppUse: true,
    embeddingAllowed: true,
    revoked: false,
  },
  {
    id: "yt-asian-cricket-council",
    organization: "Asian Cricket Council",
    sourceType: "continental_confederation",
    sport: "cricket",
    country: null,
    language: "en",
    youtubeChannelId: "UC7ITT3ooYWDYY_ehIUbt6eg",
    officialPageUrl: "https://www.asiancricket.org/",
    approvalEvidence:
      "Official Asian Cricket Council YouTube; continental confederation live women's U19 coverage",
    approvalStatus: "approved_embed",
    commercialAppUse: true,
    embeddingAllowed: true,
    revoked: false,
  },
] as const;

export function pilotApprovedChannelIds(): string[] {
  return PILOT_APPROVED_EMBED_SOURCES.map((s) => s.youtubeChannelId);
}

export function findPilotSourceByChannelId(
  channelId: string
): PilotOfficialSource | null {
  const id = String(channelId || "").trim();
  return PILOT_APPROVED_EMBED_SOURCES.find((s) => s.youtubeChannelId === id) || null;
}
