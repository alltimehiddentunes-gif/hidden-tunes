import assert from "node:assert/strict";

import { setCatalogViewSeed, consumeCatalogViewSeed } from "../services/catalogViewSeed";
import {
  appendRoomDiscoveryTracks,
  getRoomDiscoverySession,
  peekRoomInitialTracks,
  resetRoomDiscoverySession,
  upsertRoomDiscoverySession,
} from "../services/roomDiscoverySession";

function makeSong(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: String(extra.title || `Country Song ${id}`),
    artist: String(extra.artist || "Country Artist"),
    genre: "Country",
    mood: "Country",
    streamUrl: `https://example.com/${id}.mp3`,
    isOnline: true,
    ...extra,
  };
}

{
  resetRoomDiscoverySession({
    type: "mood",
    id: "country-station",
    title: "Country Station",
  });

  const exploreTracks = Array.from({ length: 12 }, (_, i) => makeSong(`country-${i}`));

  // Simulate Explore Country Station openRoom handoff (exact bug path).
  setCatalogViewSeed({
    type: "mood",
    id: "country-station",
    title: "Country Station",
    query: "Country Station",
    songs: exploreTracks as any,
  });

  const session = getRoomDiscoverySession({
    type: "mood",
    id: "country-station",
    title: "Country Station",
  });
  assert.ok(session, "shared room session must exist after Explore seed");
  assert.equal(session!.tracks.length, 12, "EXPLORE INITIAL must be 12");

  // Room Detail instant paint path (getInstantCatalogView → consumeCatalogViewSeed).
  const roomInitial = consumeCatalogViewSeed({
    type: "mood",
    id: "country-station",
    title: "Country Station",
    query: "Country Station",
  });
  assert.equal(roomInitial?.length, 12, "ROOM INITIAL must be 12 (not blank rediscovery)");

  // Durable session remains for loadCatalogView / Start Radio / auto-next.
  const startRadioInitial = peekRoomInitialTracks({
    type: "mood",
    id: "country-station",
    title: "Country Station",
  });
  assert.equal(startRadioInitial.length, 12, "START RADIO INITIAL must be same 12");

  // Pagination append + dedupe.
  appendRoomDiscoveryTracks(
    {
      type: "mood",
      id: "country-station",
      title: "Country Station",
    },
    [makeSong("country-0"), makeSong("country-13")] as any,
    { hasMore: true }
  );
  const afterPage = peekRoomInitialTracks({
    type: "mood",
    id: "country-station",
    title: "Country Station",
  });
  assert.equal(afterPage.length, 13, "pagination appends + dedupes");
  assert.equal(
    getRoomDiscoverySession({
      type: "mood",
      id: "country-station",
      title: "Country Station",
    })?.hasMore,
    true
  );

  // Second open without wiping prior work (upsert merge).
  upsertRoomDiscoverySession({
    type: "mood",
    id: "country-station",
    title: "Country Station",
    initialTracks: exploreTracks as any,
  });
  assert.equal(
    peekRoomInitialTracks({
      type: "mood",
      id: "country-station",
      title: "Country Station",
    }).length,
    13,
    "re-seed must not wipe continuation tracks"
  );

  console.log("PASS country station room handoff", {
    exploreInitial: 12,
    roomInitial: roomInitial?.length,
    startRadioInitial: startRadioInitial.length,
    afterPagination: afterPage.length,
  });
}
