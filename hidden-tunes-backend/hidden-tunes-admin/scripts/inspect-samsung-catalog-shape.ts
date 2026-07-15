import { fetchGzJson } from "../lib/tvExpansion25k/sources/shared/gzJsonFetch";

async function main() {
  const samsung = (await fetchGzJson("https://i.mjh.nz/SamsungTVPlus/.channels.json.gz")) as {
    slug?: string;
    regions?: Record<
      string,
      {
        channels?: Record<
          string,
          Record<string, unknown>
        >;
      }
    >;
  };

  const us = samsung.regions?.us?.channels || {};
  const sampleIds = Object.keys(us).slice(0, 3);
  const samples = sampleIds.map((id) => ({
    id,
    keys: Object.keys(us[id] || {}),
    channel: us[id],
  }));

  console.log(JSON.stringify({ slug: samsung.slug, sampleCount: sampleIds.length, samples }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
