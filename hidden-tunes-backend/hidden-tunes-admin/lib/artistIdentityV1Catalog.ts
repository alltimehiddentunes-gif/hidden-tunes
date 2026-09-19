import { buildArtistProfileV1, classifyArtistCandidateIds, isCanonicalArtistUuid, normalizeArtistLookup } from "@/lib/artistIdentityV1";
import { isMissingArtistSchemaError } from "@/lib/artistCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const V1_ARTIST_SELECT =
  "id,name,canonical_name,sort_name,slug,bio,biography,image_url,avatar_url,hero_image_url,status,profile_state,is_verified,verification_state,is_suspended,country_code,merged_into_artist_id,created_at,updated_at";
const BASELINE_ARTIST_SELECT = "id,name,slug,bio,image_url,created_at";

function escapeIlike(value: string) {
  return value.replace(/[\\%,_]/g, (character) => `\\${character}`);
}

async function artistRows(run: (select: string) => PromiseLike<{ data: unknown; error: { message?: string } | null }>) {
  const extended = await run(V1_ARTIST_SELECT);
  if (!extended.error) return (extended.data ?? []) as Record<string, unknown>[];
  if (!isMissingArtistSchemaError(extended.error)) throw new Error(extended.error.message ?? "artist_query_failed");
  const baseline = await run(BASELINE_ARTIST_SELECT);
  if (baseline.error) throw new Error(baseline.error.message ?? "artist_query_failed");
  return (baseline.data ?? []) as Record<string, unknown>[];
}

async function loadById(id: string) {
  const rows = await artistRows((select) =>
    supabaseAdmin.from("artists").select(select).eq("id", id).limit(1),
  );
  return rows[0] ?? null;
}

async function loadDetails(artist: Record<string, unknown>) {
  const artistId = String(artist.id);
  const [genresResult, moodsResult, externalResult, statsResult] = await Promise.all([
    supabaseAdmin.from("artist_genres").select("genre").eq("artist_id", artistId).order("sort_order"),
    supabaseAdmin.from("artist_moods").select("mood").eq("artist_id", artistId).order("sort_order"),
    supabaseAdmin.from("artist_external_ids").select("provider,external_id,status,is_public").eq("artist_id", artistId).eq("status", "active"),
    supabaseAdmin.from("artist_statistics").select("follower_count,monthly_listeners").eq("artist_id", artistId).limit(1),
  ]);
  const optional = (result: { data: unknown; error: unknown }) =>
    result.error && !isMissingArtistSchemaError(result.error) ? (() => { throw result.error; })() : (result.data ?? []);
  const genres = optional(genresResult) as Array<{ genre?: unknown }>;
  const moods = optional(moodsResult) as Array<{ mood?: unknown }>;
  const externalIds = optional(externalResult) as Array<Record<string, unknown>>;
  const statistics = (optional(statsResult) as Array<Record<string, unknown>>)[0] ?? null;
  return buildArtistProfileV1({
    artist,
    genres: genres.map((row) => row.genre),
    moods: moods.map((row) => row.mood),
    externalIds,
    statistics,
    statisticsKnown: Boolean(statistics),
  });
}

export async function loadArtistProfileV1(id: string) {
  if (!isCanonicalArtistUuid(id)) return { status: "invalid" as const };
  const source = await loadById(id);
  if (!source) return { status: "not_found" as const };
  if (source.merged_into_artist_id) {
    const canonicalId = String(source.merged_into_artist_id);
    const target = isCanonicalArtistUuid(canonicalId) ? await loadById(canonicalId) : null;
    return target
      ? { status: "merged_redirect" as const, canonicalId, profile: await loadDetails(target) }
      : { status: "not_found" as const };
  }
  const state = String(source.profile_state ?? source.status ?? "published").toLowerCase();
  if (source.is_suspended === true || state === "restricted") return { status: "restricted" as const };
  if (state === "hidden" || state === "draft") return { status: "not_found" as const };
  return { status: "resolved" as const, profile: await loadDetails(source) };
}

export async function resolveArtistV1(input: { id?: string; provider?: string; externalId?: string; slug?: string; name?: string }) {
  if (input.id) return loadArtistProfileV1(input.id);
  let candidates: Record<string, unknown>[] = [];
  if (input.provider && input.externalId) {
    const mappings = await supabaseAdmin
      .from("artist_external_ids")
      .select("artist_id")
      .eq("provider", input.provider.trim().toLowerCase())
      .eq("external_id", input.externalId.trim())
      .eq("status", "active")
      .limit(3);
    if (mappings.error) {
      if (isMissingArtistSchemaError(mappings.error)) return { status: "not_found" as const };
      throw new Error(mappings.error.message);
    }
    candidates = (mappings.data ?? []).map((row) => ({ id: row.artist_id }));
  } else if (input.slug) {
    candidates = await artistRows((select) => supabaseAdmin.from("artists").select(select).eq("slug", input.slug!.trim()).limit(3));
  } else if (input.name) {
    const normalized = normalizeArtistLookup(input.name);
    const aliases = await supabaseAdmin.from("artist_aliases").select("artist_id").eq("alias_normalized", normalized).eq("status", "active").limit(10);
    if (!aliases.error) candidates = (aliases.data ?? []).map((row) => ({ id: row.artist_id }));
    if (aliases.error && !isMissingArtistSchemaError(aliases.error)) throw new Error(aliases.error.message);
    if (candidates.length === 0) {
      const names = await artistRows((select) => supabaseAdmin.from("artists").select(select).ilike("name", escapeIlike(input.name!.trim())).limit(10));
      candidates = names.filter((row) => normalizeArtistLookup(row.name) === normalized);
    }
  } else return { status: "not_found" as const };

  const classified = classifyArtistCandidateIds(candidates.map((row) => row.id));
  const ids = classified.ids;
  if (classified.status === "not_found") return { status: "not_found" as const };
  if (classified.status === "ambiguous") {
    const safe = await Promise.all(ids.slice(0, 10).map(loadById));
    return {
      status: "ambiguous" as const,
      candidates: safe.filter(Boolean).map((row) => ({ id: String(row!.id), canonicalName: String(row!.canonical_name ?? row!.name ?? "Unknown Artist"), slug: row!.slug ? String(row!.slug) : null })),
    };
  }
  return loadArtistProfileV1(ids[0]);
}

export async function searchArtistsV1(query: string, limit: number, offset = 0) {
  const safeQuery = String(query ?? "").trim().slice(0, 120);
  if (!safeQuery) return [];
  const escaped = escapeIlike(safeQuery);
  const rows = await artistRows((select) => supabaseAdmin.from("artists").select(select).ilike("name", `%${escaped}%`).order("name").order("id").range(offset, offset + limit - 1));
  return rows
    .filter((row) => !row.merged_into_artist_id && row.is_suspended !== true && !["hidden", "restricted", "draft"].includes(String(row.profile_state ?? row.status ?? "published")))
    .map((row) => ({ id: String(row.id), canonicalName: String(row.canonical_name ?? row.name ?? "Unknown Artist"), slug: row.slug ? String(row.slug) : null, avatarUrl: row.avatar_url ? String(row.avatar_url) : row.image_url ? String(row.image_url) : null }));
}
