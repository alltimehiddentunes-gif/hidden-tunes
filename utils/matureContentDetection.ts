import type { ContentRating } from "../types/matureContent";
import { parseContentRating } from "../types/matureContent";

const MATURE_TAG_PATTERN =
  /\b(adult|18\+|explicit|erotic|xxx|porn|sex talk|mature|nsfw|adult only)\b/i;

const MATURE_NAME_PATTERN =
  /\b(18\+|adult only|xxx|porn|erotic|sex radio|adult talk)\b/i;

export function inferMatureFromTags(tags: string[]) {
  return tags.some((tag) => MATURE_TAG_PATTERN.test(String(tag || "")));
}

export function inferMatureFromName(name: string) {
  return MATURE_NAME_PATTERN.test(String(name || ""));
}

export function resolveRadioMatureFields(input: {
  name: string;
  tags?: string[];
  is_mature?: boolean;
  mature_reason?: string;
  content_rating?: ContentRating | string;
  categoryIsMature?: boolean;
}) {
  const tags = Array.isArray(input.tags) ? input.tags : [];
  const fromApi = Boolean(input.is_mature);
  const fromTags = inferMatureFromTags(tags);
  const fromName = inferMatureFromName(input.name);
  const fromCategory = Boolean(input.categoryIsMature);
  const isMature = fromApi || fromTags || fromName || fromCategory;

  const contentRating = isMature
    ? parseContentRating(input.content_rating || (fromCategory ? "adult" : "explicit"))
    : parseContentRating(input.content_rating);

  return {
    is_mature: isMature,
    mature_reason:
      input.mature_reason ||
      (fromCategory
        ? "mature_category"
        : fromTags
          ? "mature_tags"
          : fromName
            ? "mature_name"
            : undefined),
    content_rating: contentRating,
  };
}
