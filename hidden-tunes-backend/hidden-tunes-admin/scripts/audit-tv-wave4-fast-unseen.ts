import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchGzJson } from "../lib/tvExpansion25k/sources/shared/gzJsonFetch";
import { loadWave4SeenUrls } from "../lib/tvExpansion25k/worldwide/wave4SeenUrlLoader";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

function normalize(url: string) {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

type MjhChannel = {
  name?: string;
  license_url?: string;
};

type MjhCatalog = {
  slug?: string;
  regions?: Record<string, { name?: string; channels?: Record<string, MjhChannel> }>;
  channels?: Record<string, MjhChannel>;
};

function flatten(
  catalog: MjhCatalog,
  streamUrlForId: (channelId: string, catalog: MjhCatalog) => string,
  skip?: (channel: MjhChannel) => boolean
) {
  const out: Array<{ id: string; title: string; url: string; country: string }> = [];
  if (catalog.regions) {
    for (const [regionKey, region] of Object.entries(catalog.regions)) {
      for (const [id, channel] of Object.entries(region.channels || {})) {
        if (skip?.(channel)) continue;
        out.push({
          id,
          title: channel.name || id,
          url: streamUrlForId(id, catalog),
          country: regionKey.toUpperCase().slice(0, 2),
        });
      }
    }
  } else if (catalog.channels) {
    for (const [id, channel] of Object.entries(catalog.channels)) {
      if (skip?.(channel)) continue;
      out.push({
        id,
        title: channel.name || id,
        url: streamUrlForId(id, catalog),
        country: "US",
      });
    }
  }
  return out;
}

async function main() {
  const seen = loadWave4SeenUrls(adminRoot);
  const pluto = (await fetchGzJson("https://i.mjh.nz/PlutoTV/.channels.json.gz")) as MjhCatalog;
  const samsung = (await fetchGzJson(
    "https://i.mjh.nz/SamsungTVPlus/.channels.json.gz"
  )) as MjhCatalog;

  const plutoRows = flatten(pluto, (id) => `https://jmp2.uk/plu-${id}.m3u8`);
  const samsungRows = flatten(
    samsung,
    (id, catalog) => `https://jmp2.uk/${(catalog.slug || "stvp-{id}").replace("{id}", id)}`,
    (channel) => Boolean(channel.license_url)
  );

  const plutoUnseen = plutoRows.filter((row) => !seen.has(normalize(row.url)));
  const samsungUnseen = samsungRows.filter((row) => !seen.has(normalize(row.url)));

  console.log(
    JSON.stringify(
      {
        seen: seen.size,
        plutoTotal: plutoRows.length,
        plutoUnseen: plutoUnseen.length,
        samsungTotal: samsungRows.length,
        samsungUnseen: samsungUnseen.length,
        plutoSample: plutoUnseen.slice(0, 8),
        samsungSample: samsungUnseen.slice(0, 8),
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
