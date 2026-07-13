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

export function artistListResponse(items: unknown[], pagination: { hasMore: boolean; nextCursor: string | null }) {
  return NextResponse.json({
    success: true,
    items,
    pagination: {
      limit: items.length,
      hasMore: pagination.hasMore,
      nextCursor: pagination.nextCursor,
    },
  });
}

export function artistErrorResponse(error: unknown, fallback: string, status = 500) {
  console.error(`[artists] ${fallback}`, serializeArtistError(error));
  return jsonArtistError(fallback, status, error);
}
