import { slugifyPodcast } from "@/lib/podcastAdminCatalog";
import { cleanText } from "@/lib/tvCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export function buildDeterministicPodcastSlug(options: {
  source_type?: string | null;
  source_id?: string | null;
  title?: string | null;
}) {
  const sourceType = cleanText(options.source_type, 40)?.toLowerCase();
  const sourceId = cleanText(options.source_id, 120);

  if (sourceType && sourceId) {
    const base = slugifyPodcast(`${sourceType}-${sourceId}`);
    return base.slice(0, 80);
  }

  const title = cleanText(options.title, 300);
  if (title) {
    return slugifyPodcast(title);
  }

  return "podcast-show";
}

export async function resolveUniquePodcastSlug(options: {
  source_type?: string | null;
  source_id?: string | null;
  title?: string | null;
  preferred_slug?: string | null;
}) {
  const preferred = cleanText(options.preferred_slug, 80);
  const candidate = preferred || buildDeterministicPodcastSlug(options);

  const { data, error } = await supabaseAdmin
    .from("podcast_shows")
    .select("id, slug")
    .eq("slug", candidate)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return candidate;

  if (
    options.source_type &&
    options.source_id &&
    data.id
  ) {
    return candidate;
  }

  let suffix = 2;
  while (suffix < 100) {
    const next = `${candidate.slice(0, 72)}-${suffix}`;
    const { data: conflict } = await supabaseAdmin
      .from("podcast_shows")
      .select("id")
      .eq("slug", next)
      .maybeSingle();

    if (!conflict) return next;
    suffix += 1;
  }

  throw new Error("Could not generate a unique show slug.");
}
