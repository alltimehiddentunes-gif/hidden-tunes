import { NextResponse } from "next/server";

import {
  getViewerFromAuthorizationHeader,
  isArtistUuid,
  jsonArtistError,
  resolveArtistRef,
  serializeArtistError,
} from "@/lib/artistCatalog";

export type ArtistRouteContext = {
  params: Promise<{ ref: string }>;
};

export type ArtistWorldRouteContext = {
  params: Promise<{ ref: string; world: string }>;
};

export function parseArtistListQuery(searchParams: URLSearchParams) {
  return {
    limit: searchParams.get("limit"),
    cursor: searchParams.get("cursor"),
  };
}

export async function resolvePublicArtist(ref: string) {
  const artist = await resolveArtistRef(ref);
  if (!artist) return null;
  return { artist, artistId: String(artist.id) };
}

export async function requireArtistUuid(ref: string) {
  if (!isArtistUuid(ref)) {
    return { error: jsonArtistError("Artist follow requires a UUID artist id.", 400) };
  }
  const artist = await resolveArtistRef(ref);
  if (!artist) return { error: jsonArtistError("Artist not found.", 404) };
  return { artistId: String(artist.id) };
}

export async function getOptionalViewerUserId(request: Request) {
  const viewer = await getViewerFromAuthorizationHeader(request.headers.get("authorization"));
  return viewer?.id || null;
}

export function artistListResponse(
  items: unknown[],
  pagination: { hasMore: boolean; nextCursor: string | null },
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({
    success: true,
    items,
    pagination: {
      limit: items.length,
      hasMore: pagination.hasMore,
      nextCursor: pagination.nextCursor,
    },
    ...(extra || {}),
  });
}

export function parseArtistReleaseType(searchParams: URLSearchParams) {
  const raw = searchParams.get("type") || searchParams.get("releaseType") || searchParams.get("release_type");
  if (!raw || String(raw).trim().toLowerCase() === "all") return null;
  return String(raw).trim().toLowerCase();
}

export function artistErrorResponse(error: unknown, fallback: string, status = 500) {
  const message = serializeArtistError(error);
  console.error(`[artists] ${fallback}`, message);

  const statusFromError =
    error && typeof error === "object" && "status" in error
      ? Number((error as { status?: unknown }).status)
      : NaN;
  const resolvedStatus = Number.isFinite(statusFromError) && statusFromError >= 400
    ? statusFromError
    : status;

  return jsonArtistError(fallback, resolvedStatus, {
    message,
  });
}

export function validateArtistRefParam(ref: string) {
  const key = String(ref || "").trim();
  if (!key) {
    return { error: jsonArtistError("Artist reference is required.", 400) };
  }

  // UUID-shaped but not a valid RFC UUID → 400 (do not treat as slug).
  const looseUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
  if (looseUuid && !isArtistUuid(key)) {
    return { error: jsonArtistError("Invalid artist UUID.", 400) };
  }

  return { ref: key };
}
