import { invalidateArtistCache } from "@/lib/artistProfileCache";
import { ARTIST_PUBLIC_SELECT, DEFAULT_PROFILE_SECTIONS } from "@/lib/artistCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function cleanText(value: unknown, max = 500) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function slugify(value: string) {
  return cleanText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function listAdminArtists(options: {
  search?: string | null;
  status?: string | null;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, Number(options.page || 1));
  const limit = Math.min(100, Math.max(1, Number(options.limit || 50)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseAdmin
    .from("artists")
    .select(ARTIST_PUBLIC_SELECT, { count: "exact" })
    .order("name", { ascending: true });

  const search = cleanText(options.search, 120);
  if (search) query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);
  const status = cleanText(options.status, 40);
  if (status && status !== "all") query = query.eq("status", status);

  const { data, error, count } = await query.range(from, to);
  if (error) throw new Error(error.message);

  return {
    artists: data || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: count ? Math.ceil(count / limit) : 0,
      hasMore: (count || 0) > page * limit,
    },
  };
}

export async function getAdminArtistDetail(artistId: string) {
  const { data: artist, error } = await supabaseAdmin
    .from("artists")
    .select(ARTIST_PUBLIC_SELECT)
    .eq("id", artistId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!artist) return null;

  const [
    aliases,
    genres,
    images,
    sections,
    biography,
    links,
    externalIds,
    statistics,
    rights,
    claims,
  ] = await Promise.all([
    supabaseAdmin.from("artist_aliases").select("*").eq("artist_id", artistId).order("created_at"),
    supabaseAdmin.from("artist_genres").select("*").eq("artist_id", artistId).order("sort_order"),
    supabaseAdmin.from("artist_images").select("*").eq("artist_id", artistId).order("sort_order"),
    supabaseAdmin.from("artist_profile_sections").select("*").eq("artist_id", artistId).order("sort_order"),
    supabaseAdmin.from("artist_biography_sections").select("*").eq("artist_id", artistId).order("sort_order"),
    supabaseAdmin.from("artist_external_links").select("*").eq("artist_id", artistId).order("sort_order"),
    supabaseAdmin.from("artist_external_ids").select("*").eq("artist_id", artistId),
    supabaseAdmin.from("artist_statistics").select("*").eq("artist_id", artistId).maybeSingle(),
    supabaseAdmin.from("artist_rights_availability").select("*").eq("artist_id", artistId).maybeSingle(),
    supabaseAdmin.from("artist_claims").select("*").eq("artist_id", artistId).order("created_at", { ascending: false }),
  ]);

  return {
    artist,
    aliases: aliases.data || [],
    genres: genres.data || [],
    images: images.data || [],
    sections: sections.data || [],
    biography: biography.data || [],
    links: links.data || [],
    externalIds: externalIds.data || [],
    statistics: statistics.data || null,
    rights: rights.data || null,
    claims: claims.data || [],
  };
}

export async function createAdminArtist(input: {
  name: string;
  slug?: string | null;
  bio?: string | null;
  image_url?: string | null;
  status?: string;
}) {
  const name = cleanText(input.name, 200);
  if (!name) throw new Error("Artist name is required.");
  const slug = slugify(input.slug || name);
  const { data, error } = await supabaseAdmin
    .from("artists")
    .insert({
      name,
      slug,
      bio: input.bio ? cleanText(input.bio, 8000) : null,
      image_url: input.image_url ? cleanText(input.image_url, 2000) : null,
      status: input.status || "draft",
      profile_published_at: input.status === "published" ? new Date().toISOString() : null,
    })
    .select(ARTIST_PUBLIC_SELECT)
    .single();
  if (error) throw new Error(error.message);

  const artistId = String(data.id);
  await supabaseAdmin.from("artist_profile_sections").insert(
    DEFAULT_PROFILE_SECTIONS.map((section, index) => ({
      artist_id: artistId,
      section_key: section.section_key,
      title_override: section.title_override,
      display_style: section.display_style,
      endpoint_path: section.endpoint_path,
      sort_order: index * 10,
      is_enabled: true,
    }))
  );
  await refreshAdminArtistStatistics(artistId);
  return data;
}

export async function updateAdminArtist(artistId: string, patch: Record<string, unknown>) {
  const allowed = [
    "name",
    "slug",
    "bio",
    "image_url",
    "status",
    "is_verified",
    "is_featured",
    "is_suspended",
    "country_code",
    "hometown",
    "debut_year",
    "website_url",
    "explicit_rating",
    "featured_release_id",
  ];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in patch) update[key] = patch[key];
  }
  if (patch.status === "published" && !patch.profile_published_at) {
    update.profile_published_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from("artists")
    .update(update)
    .eq("id", artistId)
    .select(ARTIST_PUBLIC_SELECT)
    .single();
  if (error) throw new Error(error.message);
  invalidateArtistCache(artistId);
  await logArtistAudit(artistId, patch.actor_user_id as string | undefined, "artist.updated", patch);
  return data;
}

export async function replaceAdminArtistGenres(artistId: string, genres: string[]) {
  await supabaseAdmin.from("artist_genres").delete().eq("artist_id", artistId);
  if (genres.length > 0) {
    const { error } = await supabaseAdmin.from("artist_genres").insert(
      genres.map((genre, index) => ({
        artist_id: artistId,
        genre: cleanText(genre, 120),
        sort_order: index,
        is_primary: index === 0,
      }))
    );
    if (error) throw new Error(error.message);
  }
  invalidateArtistCache(artistId);
}

export async function replaceAdminArtistSections(
  artistId: string,
  sections: Array<{
    section_key: string;
    title_override?: string | null;
    display_style?: string;
    endpoint_path?: string;
    sort_order?: number;
    is_enabled?: boolean;
  }>
) {
  await supabaseAdmin.from("artist_profile_sections").delete().eq("artist_id", artistId);
  if (sections.length > 0) {
    const { error } = await supabaseAdmin.from("artist_profile_sections").insert(
      sections.map((section, index) => ({
        artist_id: artistId,
        section_key: section.section_key,
        title_override: section.title_override || null,
        display_style: section.display_style || "list",
        endpoint_path: section.endpoint_path || section.section_key,
        sort_order: section.sort_order ?? index * 10,
        is_enabled: section.is_enabled !== false,
      }))
    );
    if (error) throw new Error(error.message);
  }
  invalidateArtistCache(artistId);
}

export async function upsertAdminArtistImage(
  artistId: string,
  input: { image_url: string; image_type?: string; is_primary?: boolean; sort_order?: number }
) {
  const { data, error } = await supabaseAdmin
    .from("artist_images")
    .insert({
      artist_id: artistId,
      image_url: cleanText(input.image_url, 2000),
      image_type: input.image_type || "profile",
      is_primary: input.is_primary === true,
      sort_order: input.sort_order ?? 0,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  if (input.is_primary) {
    await supabaseAdmin.from("artists").update({ image_url: input.image_url }).eq("id", artistId);
  }
  invalidateArtistCache(artistId);
  return data;
}

export async function mergeAdminArtists(sourceArtistId: string, targetArtistId: string, actorUserId?: string) {
  if (sourceArtistId === targetArtistId) throw new Error("Cannot merge an artist into itself.");
  const { error: mergeError } = await supabaseAdmin.from("artist_merges").insert({
    source_artist_id: sourceArtistId,
    target_artist_id: targetArtistId,
    merged_by_user_id: actorUserId || null,
  });
  if (mergeError) throw new Error(mergeError.message);

  const { error: updateError } = await supabaseAdmin
    .from("artists")
    .update({ merged_into_artist_id: targetArtistId, status: "merged", updated_at: new Date().toISOString() })
    .eq("id", sourceArtistId);
  if (updateError) throw new Error(updateError.message);

  invalidateArtistCache(sourceArtistId);
  invalidateArtistCache(targetArtistId);
  await logArtistAudit(targetArtistId, actorUserId, "artist.merged", { sourceArtistId });
}

export async function refreshAdminArtistStatistics(artistId: string) {
  const [songs, albums, singles, videos, followers, collaborations] = await Promise.all([
    supabaseAdmin.from("songs").select("id", { count: "exact", head: true }).eq("artist_id", artistId).eq("is_public", true),
    supabaseAdmin.from("albums").select("id", { count: "exact", head: true }).eq("artist_id", artistId),
    supabaseAdmin.from("songs").select("id", { count: "exact", head: true }).eq("artist_id", artistId).eq("is_public", true).is("album_id", null),
    supabaseAdmin.from("artist_videos").select("id", { count: "exact", head: true }).eq("artist_id", artistId).eq("is_published", true),
    supabaseAdmin.from("artist_followers").select("user_id", { count: "exact", head: true }).eq("artist_id", artistId),
    supabaseAdmin.from("artist_collaborations").select("id", { count: "exact", head: true }).eq("artist_id", artistId).eq("is_published", true),
  ]);

  const snapshot = {
    artist_id: artistId,
    song_count: songs.count || 0,
    release_count: albums.count || 0,
    single_count: singles.count || 0,
    video_count: videos.count || 0,
    follower_count: followers.count || 0,
    collaboration_count: collaborations.count || 0,
    refreshed_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("artist_statistics")
    .upsert(snapshot)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  invalidateArtistCache(artistId);
  return data;
}

export async function upsertAdminArtistRights(artistId: string, patch: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin
    .from("artist_rights_availability")
    .upsert({
      artist_id: artistId,
      territory_mode: patch.territory_mode || "worldwide",
      allowed_territories: patch.allowed_territories || [],
      blocked_territories: patch.blocked_territories || [],
      subscription_tier: patch.subscription_tier || null,
      license_notes: patch.license_notes || null,
      takedown_status: patch.takedown_status || "none",
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  invalidateArtistCache(artistId);
  return data;
}

export async function reviewAdminArtistClaim(claimId: string, status: "approved" | "rejected", reviewerUserId: string) {
  const { data, error } = await supabaseAdmin
    .from("artist_claims")
    .update({
      status,
      reviewed_by_user_id: reviewerUserId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", claimId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  if (status === "approved" && data?.artist_id) {
    await supabaseAdmin.from("artists").update({ is_verified: true }).eq("id", data.artist_id);
    invalidateArtistCache(String(data.artist_id));
  }
  return data;
}

export async function logArtistAudit(
  artistId: string,
  actorUserId: string | undefined,
  action: string,
  details: Record<string, unknown> = {}
) {
  await supabaseAdmin.from("artist_audit_logs").insert({
    artist_id: artistId,
    actor_user_id: actorUserId || null,
    action,
    details,
  });
}
