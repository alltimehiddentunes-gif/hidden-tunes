export const ARTIST_API_VERSION = "v1" as const;

export const ARTIST_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ARTIST_V1_CAPABILITIES = Object.freeze({
  follow: false,
  share: true,
  artistRadio: false,
  claim: false,
  manage: false,
  tips: false,
  memberships: false,
  hiddenCoins: false,
});

export type ArtistVerificationState = "unverified" | "pending" | "verified" | "restricted";
export type ArtistProfileState = "active" | "hidden" | "merged" | "restricted";
export type ArtistResolutionStatus =
  | "resolved"
  | "ambiguous"
  | "not_found"
  | "merged_redirect"
  | "restricted";

export type ArtistExternalIdV1 = {
  provider: string;
  externalId: string;
};

export type ArtistProfileV1 = {
  apiVersion: typeof ARTIST_API_VERSION;
  id: string;
  canonicalName: string;
  sortName: string | null;
  slug: string | null;
  biography: string | null;
  countryCode: string | null;
  avatarUrl: string | null;
  heroImageUrl: string | null;
  verificationState: ArtistVerificationState;
  profileState: ArtistProfileState;
  genres: string[];
  moods: string[];
  externalIds: ArtistExternalIdV1[];
  stats: { followers: number | null; monthlyListeners: number | null };
  capabilities: typeof ARTIST_V1_CAPABILITIES;
};

export function normalizeArtistLookup(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("und");
}

export function isCanonicalArtistUuid(value: unknown) {
  return ARTIST_UUID_RE.test(String(value ?? "").trim());
}

function nullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function nullableCount(value: unknown, known: boolean) {
  if (!known || value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

export function buildArtistProfileV1(input: {
  artist: Record<string, unknown>;
  genres?: unknown[];
  moods?: unknown[];
  externalIds?: Array<Record<string, unknown>>;
  statistics?: Record<string, unknown> | null;
  statisticsKnown?: boolean;
}): ArtistProfileV1 {
  const artist = input.artist;
  const id = String(artist.id ?? "").trim();
  if (!isCanonicalArtistUuid(id)) throw new Error("invalid_artist_uuid");
  const canonicalName = nullableText(artist.canonical_name ?? artist.name);
  if (!canonicalName) throw new Error("missing_canonical_name");

  const restricted = artist.is_suspended === true || String(artist.status ?? "").toLowerCase() === "restricted";
  const merged = Boolean(artist.merged_into_artist_id);
  const status = String(artist.profile_state ?? artist.status ?? "published").toLowerCase();
  const profileState: ArtistProfileState = restricted
    ? "restricted"
    : merged
      ? "merged"
      : status === "hidden" || status === "draft"
        ? "hidden"
        : "active";
  const verificationRaw = String(artist.verification_state ?? "").toLowerCase();
  const verificationState: ArtistVerificationState = restricted
    ? "restricted"
    : verificationRaw === "pending"
      ? "pending"
      : verificationRaw === "verified" || artist.is_verified === true
        ? "verified"
        : "unverified";

  const externalIds = (input.externalIds ?? [])
    .filter((item) => String(item.status ?? "active") === "active" && item.is_public !== false)
    .map((item) => ({
      provider: String(item.provider ?? "").trim(),
      externalId: String(item.external_id ?? item.externalId ?? "").trim(),
    }))
    .filter((item) => item.provider && item.externalId);
  const statistics = input.statistics ?? {};

  return {
    apiVersion: ARTIST_API_VERSION,
    id,
    canonicalName,
    sortName: nullableText(artist.sort_name),
    slug: nullableText(artist.slug),
    biography: nullableText(artist.biography ?? artist.bio),
    countryCode: nullableText(artist.country_code),
    avatarUrl: nullableText(artist.avatar_url ?? artist.image_url),
    heroImageUrl: nullableText(artist.hero_image_url),
    verificationState,
    profileState,
    genres: (input.genres ?? []).map(String).map((value) => value.trim()).filter(Boolean),
    moods: (input.moods ?? []).map(String).map((value) => value.trim()).filter(Boolean),
    externalIds,
    stats: {
      followers: nullableCount(statistics.follower_count, input.statisticsKnown === true),
      monthlyListeners: nullableCount(statistics.monthly_listeners, input.statisticsKnown === true),
    },
    capabilities: ARTIST_V1_CAPABILITIES,
  };
}

export function assertArtistProfileV1(value: ArtistProfileV1) {
  if (value.apiVersion !== ARTIST_API_VERSION) throw new Error("invalid_api_version");
  if (!isCanonicalArtistUuid(value.id)) throw new Error("invalid_artist_uuid");
  if (!value.canonicalName) throw new Error("missing_canonical_name");
  for (const key of ["claim", "manage", "tips", "memberships", "hiddenCoins"] as const) {
    if (value.capabilities[key] !== false) throw new Error(`unsafe_capability_${key}`);
  }
  const serialized = JSON.stringify(value);
  for (const privateKey of ["owner", "claimant", "tax", "payout", "bank", "revenue"]) {
    if (serialized.toLowerCase().includes(`\"${privateKey}`)) throw new Error(`private_field_${privateKey}`);
  }
  return value;
}

export function classifyArtistCandidateIds(values: unknown[]) {
  const ids = [...new Set(values.map((value) => String(value ?? "").trim()).filter(isCanonicalArtistUuid))];
  if (ids.length === 0) return { status: "not_found" as const, ids };
  if (ids.length > 1) return { status: "ambiguous" as const, ids };
  return { status: "resolved" as const, ids };
}

/** Temporary boundary adapter for existing Mobile/Desktop identity models. */
export function toLegacyArtistIdentity(profile: ArtistProfileV1) {
  return {
    id: profile.id,
    name: profile.canonicalName,
    slug: profile.slug,
    artwork: profile.avatarUrl,
    bio: profile.biography,
    is_verified: profile.verificationState === "verified",
    country_code: profile.countryCode,
    genres: profile.genres,
  };
}
