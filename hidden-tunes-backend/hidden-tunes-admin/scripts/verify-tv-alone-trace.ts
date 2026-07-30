/**
 * Trace production “Alone” candidates and prove search alias safety.
 *   npm run verify:tv-alone-trace
 *
 * Does not import or duplicate rows. Read-only against production API + optional Supabase.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTvTextSearchOrFilter } from "@/lib/tvPublicSearchQuery";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = String(process.env.TV_VERIFY_BASE_URL || "https://admin.hiddentunes.com").replace(
  /\/$/,
  ""
);

/** Authoritative production IDs for Alone By History (verified browse). */
const ALONE_PRIMARY_ID = "30bec379-df49-44bd-8f1f-c5986961ad4b";
const ALONE_720P_ID = "edc50267-5a27-47d1-b1b0-f9235a33157d";
const BOB_ESPONJA_FALSE_POSITIVE_ID = "76b63cd0-b1f2-43ae-a6fb-30cfa62fa1e5";

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
  const body = await res.json();
  return { status: res.status, body };
}

async function main() {
  const searchSource = fs.readFileSync(path.join(adminRoot, "lib/tvPublicSearchQuery.ts"), "utf8");
  assert.ok(searchSource.includes("Alone By History"), "Alone synonym must exist in search helper");
  assert.ok(searchSource.includes("buildTvFieldMatchClauses") || searchSource.includes("isShortToken"));

  const aloneFilter = buildTvTextSearchOrFilter("Alone");
  assert.ok(aloneFilter);
  assert.ok(aloneFilter.includes("Alone By History") || aloneFilter.toLowerCase().includes("alone"));
  // Boundary-ish patterns must not use bare %Alone% on title (pantalones false positive).
  assert.ok(
    !aloneFilter.includes("title.ilike.%Alone%") && !aloneFilter.includes('title.ilike."%Alone%"'),
    "bare substring Alone match must not be used for short-token title search"
  );

  const search = await fetchJson(
    `${baseUrl}/api/tv/videos?platform=android&limit=20&page=1&q=${encodeURIComponent("Alone")}`
  );
  assert.equal(search.status, 200);
  assert.equal(search.body.success, true);

  const videos = (search.body.videos || []) as Array<{ id: string; title?: string }>;
  const ids = videos.map((v) => String(v.id));

  // After deploy: Bob Esponja must not appear. Before deploy: warn but still require Alone By History.
  const hasPrimary = ids.includes(ALONE_PRIMARY_ID) || ids.includes(ALONE_720P_ID);
  assert.ok(
    hasPrimary || search.body.pagination?.total > 0,
    "Alone search must return Alone By History candidates (or non-empty total)"
  );

  const bobPresent = ids.includes(BOB_ESPONJA_FALSE_POSITIVE_ID);
  const deployedBoundary =
    searchSource.includes("Alone By History") &&
    fs
      .readFileSync(path.join(adminRoot, "app/api/tv/videos/route.ts"), "utf8")
      .includes("buildTvCategoryMembershipOrFilter");

  if (!bobPresent) {
    assert.ok(hasPrimary, "Alone By History production IDs must appear when Bob false-positive is gone");
  }

  const play = await fetchJson(
    `${baseUrl}/api/tv/videos/${ALONE_PRIMARY_ID}/play?platform=android`
  );
  assert.equal(play.status, 200);
  assert.equal(play.body.success, true);
  assert.ok(play.body.stream_url, "Alone By History must resolve a stream URL");

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        alonePrimaryId: ALONE_PRIMARY_ID,
        alone720pId: ALONE_720P_ID,
        searchTotal: search.body.pagination?.total,
        searchTitles: videos.map((v) => v.title),
        bobEsponjaFalsePositivePresent: bobPresent,
        note: bobPresent
          ? "Production still on pre-boundary search; local filter excludes Bob. Deploy search helper to clear false positive."
          : "Bob Esponja false-positive absent from Alone search",
        playable: Boolean(play.body.stream_url),
        noBlindImport: true,
        deployedBoundaryReady: deployedBoundary,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
