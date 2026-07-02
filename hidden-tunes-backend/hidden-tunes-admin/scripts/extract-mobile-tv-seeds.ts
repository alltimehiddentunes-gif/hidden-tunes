import fs from "node:fs";
import path from "node:path";

type ExtractedSeed = {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string;
  streamUrl: string;
  country?: string;
  language?: string;
  category?: string;
  isFeatured?: boolean;
  catalogStatus?: string;
};

function parseSeedBlocks(source: string) {
  const blocks = source.split(/seedChannel\(\{/);
  const seeds: ExtractedSeed[] = [];

  for (const block of blocks.slice(1)) {
    const chunk = block.split(/\}\),/)[0] || block.split(/\}\)/)[0] || "";
    const read = (key: string) => {
      const match = chunk.match(new RegExp(`${key}:\\s*["']([^"']+)["']`));
      return match?.[1];
    };
    const readBool = (key: string) => /true/.test(String(chunk.match(new RegExp(`${key}:\\s*(true|false)`))?.[1]));

    const id = read("id");
    const name = read("name");
    const streamUrl = read("streamUrl");
    if (!id || !name || !streamUrl) continue;

    seeds.push({
      id,
      name,
      description: read("description"),
      logoUrl: read("logoUrl"),
      streamUrl,
      country: read("country"),
      language: read("language"),
      category: read("category"),
      isFeatured: readBool("isFeatured"),
      catalogStatus: read("catalogStatus"),
    });
  }

  return seeds;
}

function main() {
  const mobileCatalogPath = path.resolve(
    __dirname,
    "../../../hidden-tunes-app/data/tvChannelSeedCatalog.ts"
  );
  const outputPath = path.resolve(__dirname, "../data/tv-curated-hls-seeds.json");

  const source = fs.readFileSync(mobileCatalogPath, "utf8");
  const seeds = parseSeedBlocks(source).filter(
    (seed) => seed.catalogStatus !== "temporarily_unavailable"
  );

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(seeds, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        source: mobileCatalogPath,
        output: outputPath,
        count: seeds.length,
      },
      null,
      2
    )
  );
}

main();
