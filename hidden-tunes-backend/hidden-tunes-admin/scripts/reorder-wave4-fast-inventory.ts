import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const fastPath = path.join(
  adminRoot,
  "lib/tvExpansion25k/sources/data/worldwave4/officialFastProvidersWave4.json"
);

const preferred = ["US", "GB", "CA", "AU", "DE", "FR", "IT", "ES", "BR", "MX", "IN"];

function rank(country: string | null | undefined) {
  const code = String(country || "").toUpperCase();
  const index = preferred.indexOf(code);
  return index === -1 ? preferred.length + 1 : index;
}

const rows = JSON.parse(fs.readFileSync(fastPath, "utf8")) as Array<{
  title?: string;
  country?: string | null;
}>;

rows.sort((a, b) => {
  const byCountry = rank(a.country) - rank(b.country);
  if (byCountry !== 0) return byCountry;
  return String(a.title || "").localeCompare(String(b.title || ""));
});

const tempPath = `${fastPath}.tmp`;
fs.writeFileSync(tempPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
fs.renameSync(tempPath, fastPath);

const counts: Record<string, number> = {};
for (const row of rows) {
  const key = String(row.country || "null");
  counts[key] = (counts[key] || 0) + 1;
}

console.log(
  JSON.stringify(
    {
      total: rows.length,
      firstCountries: rows.slice(0, 12).map((row) => row.country),
      countryCounts: Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12),
    },
    null,
    2
  )
);
