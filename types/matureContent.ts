export type ContentRating = "clean" | "explicit" | "adult";

export type MatureContentFields = {
  is_mature?: boolean;
  mature_reason?: string;
  content_rating?: ContentRating;
};

export type MatureContentItem = MatureContentFields & {
  id?: string;
  title?: string;
};

export function isMatureContentItem(item?: MatureContentFields | null) {
  if (!item) return false;
  if (item.is_mature) return true;
  return item.content_rating === "explicit" || item.content_rating === "adult";
}

export function parseContentRating(value: unknown): ContentRating {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (normalized === "explicit" || normalized === "adult") {
    return normalized;
  }

  return "clean";
}
