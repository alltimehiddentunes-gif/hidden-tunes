/**
 * Local smoke test for Artist Profile loaders against the configured Supabase DB.
 * Does not start Next.js and does not write data.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadArtistAbout,
  loadArtistProfileShell,
  loadArtistReleases,
  loadArtistSimilar,
  loadArtistTopSongs,
  resolveArtistRef,
} from "../lib/artistCatalog";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(path.join(adminRoot, ".env.local"));
loadEnv(path.join(adminRoot, ".env"));

async function main() {
  const artistId = String(
    process.env.ARTIST_VERIFY_ARTIST_ID || "2da7464d-7fa6-4962-ba1c-a0e57d817619",
  ).trim();

  const started = Date.now();
  const resolved = await resolveArtistRef(artistId);
  const shell = await loadArtistProfileShell(artistId, null);
  const topSongs = shell ? await loadArtistTopSongs(String(shell.artist.id), { limit: 5 }) : null;
  const releases = shell ? await loadArtistReleases(String(shell.artist.id), { limit: 5 }) : null;
  const similar = shell ? await loadArtistSimilar(String(shell.artist.id), 5) : null;
  const about = shell ? await loadArtistAbout(String(shell.artist.id)) : null;
  const missing = await resolveArtistRef("00000000-0000-0000-0000-000000000000");

  const payload = {
    ok: Boolean(shell),
    ms: Date.now() - started,
    artistId,
    resolvedName: resolved ? String(resolved.name) : null,
    shellSections: shell?.sections?.map((section) => section.key) || [],
    songCount: shell?.statistics?.song_count ?? null,
    topSongs: topSongs?.items?.length ?? 0,
    releases: releases?.items?.length ?? 0,
    similar: similar?.length ?? 0,
    aboutHasBio: Boolean(about?.bio),
    missingIsNull: missing === null,
    hasAudioLeak: JSON.stringify({ shell, topSongs, releases, similar, about }).match(
      /audio_url|stream_url|embed_url/i,
    )
      ? true
      : false,
  };

  console.log(JSON.stringify(payload, null, 2));
  if (!payload.ok || !payload.missingIsNull || payload.hasAudioLeak) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
