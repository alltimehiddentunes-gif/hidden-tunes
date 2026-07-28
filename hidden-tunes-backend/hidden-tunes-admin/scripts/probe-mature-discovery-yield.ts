import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { discoverMaturePodcastFeedsFromItunes } from "@/lib/podcastItunesDiscovery";
import { loadPodcastMassExpansionState } from "@/lib/podcastMassExpansionCheckpoint";
import {
  PODCAST_EXPANSION_ITUNES_COUNTRIES,
  PODCAST_MATURE_ITUNES_QUERIES,
} from "@/lib/podcastSourceRegistry";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(filePath: string) {
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

loadEnvFile(path.join(adminRoot, ".env.local"));
loadEnvFile(path.join(adminRoot, ".env"));

async function main() {
  const state = loadPodcastMassExpansionState(adminRoot);
  const done = new Set(
    (state.completed_feed_urls || []).map((url) => url.toLowerCase())
  );

  const probes = [
    { q: "podcast erotico", c: "BR" },
    { q: "erotik podcast", c: "DE" },
    { q: "sex education podcast", c: "US" },
    { q: "__genre_chart:1512", c: "DE" },
    { q: "__genre_chart:1512", c: "BR" },
    { q: "__genre_chart:1512", c: "FR" },
    { q: "__genre_chart:1512", c: "JP" },
    { q: "__genre_chart:1512", c: "MX" },
    { q: "bdsm podcast", c: "US" },
    { q: "spicy podcast explicit", c: "US" },
    { q: "__genre_chart:1303", c: "US" },
  ];

  for (const probe of probes) {
    const feeds = await discoverMaturePodcastFeedsFromItunes({
      query: probe.q,
      country: probe.c,
      limit: 80,
      per_query: 50,
      offsets: [0],
    });
    const fresh = feeds.filter((feed) => !done.has(feed.feedUrl.toLowerCase()));
    console.log(
      JSON.stringify({
        q: probe.q,
        c: probe.c,
        found: feeds.length,
        fresh: fresh.length,
        sample: fresh.slice(0, 3).map((feed) => feed.title),
      })
    );
  }

  console.log(
    JSON.stringify({
      queryLen: PODCAST_MATURE_ITUNES_QUERIES.length,
      countries: PODCAST_EXPANSION_ITUNES_COUNTRIES.length,
      chart1512idx: PODCAST_MATURE_ITUNES_QUERIES.findIndex(
        (query) => query === "__genre_chart:1512"
      ),
      completed: done.size,
    })
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
