import { MOTIVATION_CATALOG_BASE_URL } from "../constants/motivationCatalog";

export const MOTIVATION_CATALOG_API_PATH = "/api/motivation/items";
export const MOTIVATION_PLAY_API_PATH = "/api/motivation/items";
export const MOTIVATION_DEFAULT_PAGE_LIMIT = 20;
export const MOTIVATION_MAX_PAGE_LIMIT = 40;

export type HiddenTunesMotivationItem = {
  id: string;
  title: string;
  description?: string | null;
  artwork?: string | null;
  channel_name?: string | null;
  category?: string | null;
  subcategory?: string | null;
  tags?: string[];
  language?: string | null;
  country?: string | null;
  duration_seconds?: number | null;
  reliability_score?: number;
  is_featured?: boolean;
};

export type HiddenTunesMotivationPlayback = {
  id: string;
  source_type: string;
  source_id: string;
  stream_url: string;
  embed_url: string | null;
};

export type MotivationCatalogQuery = {
  limit?: number;
  cursor?: string | null;
  category?: string;
  subcategory?: string;
  q?: string;
  featured?: boolean;
};

export type MotivationCatalogResponse = {
  success: boolean;
  items: HiddenTunesMotivationItem[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  error?: string;
};

function buildMotivationCatalogUrl(query: MotivationCatalogQuery = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(MOTIVATION_MAX_PAGE_LIMIT, query.limit || MOTIVATION_DEFAULT_PAGE_LIMIT)));
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.category) params.set("category", query.category);
  if (query.subcategory) params.set("subcategory", query.subcategory);
  if (query.q) params.set("q", query.q);
  if (query.featured) params.set("featured", "true");
  return `${MOTIVATION_CATALOG_BASE_URL}${MOTIVATION_CATALOG_API_PATH}?${params.toString()}`;
}

export async function fetchMotivationCatalogPage(
  query: MotivationCatalogQuery = {}
): Promise<MotivationCatalogResponse> {
  const response = await fetch(buildMotivationCatalogUrl(query), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const body = (await response.json()) as MotivationCatalogResponse;
  if (!response.ok || !body?.success) {
    throw new Error(body?.error || "Motivation catalog request failed.");
  }

  for (const item of body.items || []) {
    if ("stream_url" in item || "source_url" in item || "embed_url" in item) {
      throw new Error("Motivation list response included playback URLs.");
    }
  }

  return body;
}

export async function fetchMotivationPlayback(
  itemId: string
): Promise<HiddenTunesMotivationPlayback> {
  const cleanId = String(itemId || "").trim();
  if (!cleanId) {
    throw new Error("Motivation item id is required.");
  }

  const response = await fetch(
    `${MOTIVATION_CATALOG_BASE_URL}${MOTIVATION_PLAY_API_PATH}/${encodeURIComponent(cleanId)}/play`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    }
  );

  const body = (await response.json()) as {
    success?: boolean;
    error?: string;
    id?: string;
    source_type?: string;
    source_id?: string;
    stream_url?: string;
    embed_url?: string | null;
  };

  if (!response.ok || !body?.success || !body.stream_url) {
    throw new Error(body?.error || "Motivation playback is unavailable.");
  }

  return {
    id: String(body.id || cleanId),
    source_type: String(body.source_type || ""),
    source_id: String(body.source_id || ""),
    stream_url: String(body.stream_url),
    embed_url: body.embed_url || null,
  };
}

export function formatMotivationDuration(seconds?: number | null) {
  const total = Math.max(0, Number(seconds || 0));
  if (!total) return null;
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}
