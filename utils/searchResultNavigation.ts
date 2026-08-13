import { isArtistUuid } from "./artistIdentity";

export type SearchEntityRoute = {
  pathname: "/artist/[id]" | "/album/[id]";
  params: { id: string };
};

export function buildArtistSearchRoute(artist: { id?: unknown }): SearchEntityRoute | null {
  const id = String(artist.id || "").trim();
  if (!isArtistUuid(id)) return null;
  return { pathname: "/artist/[id]", params: { id } };
}

export function buildAlbumSearchRoute(album: { id?: unknown }): SearchEntityRoute | null {
  const id = String(album.id || "").trim();
  if (!id || id === "undefined" || id === "null") return null;
  return { pathname: "/album/[id]", params: { id } };
}
