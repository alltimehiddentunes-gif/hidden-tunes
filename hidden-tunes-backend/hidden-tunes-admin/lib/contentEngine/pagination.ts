import type {
  ContentCursorPage,
  ContentCursorPayload,
} from "@/lib/contentEngine/types";

export const CONTENT_ENGINE_DEFAULT_PAGE_SIZE = 20;
export const CONTENT_ENGINE_MAX_PAGE_SIZE = 30;

export function clampContentPageSize(value: unknown, fallback = CONTENT_ENGINE_DEFAULT_PAGE_SIZE) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(CONTENT_ENGINE_MAX_PAGE_SIZE, Math.floor(parsed));
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64").toString("utf8");
}

export function encodeContentCursor(payload: ContentCursorPayload) {
  return encodeBase64Url(JSON.stringify(payload));
}

export function decodeContentCursor(
  cursor: string | null | undefined,
  expectedScope?: string
): ContentCursorPayload | null {
  const raw = String(cursor || "").trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(decodeBase64Url(raw)) as ContentCursorPayload;
    if (parsed.v !== 1) return null;
    if (!parsed.scope || !parsed.sortValue || !parsed.id) return null;
    if (expectedScope && parsed.scope !== expectedScope) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildContentCursorPage<T>(input: {
  items: T[];
  limit: number;
  scope: string;
  getSortValue: (item: T) => string;
  getId: (item: T) => string;
}): ContentCursorPage<T> {
  const hasMore = input.items.length > input.limit;
  const pageItems = hasMore ? input.items.slice(0, input.limit) : input.items;
  const lastItem = pageItems[pageItems.length - 1];

  return {
    items: pageItems,
    hasMore,
    nextCursor:
      hasMore && lastItem
        ? encodeContentCursor({
            v: 1,
            scope: input.scope,
            sortValue: input.getSortValue(lastItem),
            id: input.getId(lastItem),
          })
        : null,
  };
}

export function parseContentCursorSortBoundary(cursor: ContentCursorPayload | null) {
  if (!cursor) return null;

  return {
    sortValue: cursor.sortValue,
    id: cursor.id,
  };
}
