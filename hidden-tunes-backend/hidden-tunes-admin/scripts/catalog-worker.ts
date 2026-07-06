import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATALOG_WORKERS,
  runCatalogWorker,
  type CatalogWorkerSection,
} from "@/lib/catalogWorkerSystem";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

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

function parseSection(argv: string[]) {
  const sectionIndex = argv.indexOf("--section");
  const section = sectionIndex >= 0 ? argv[sectionIndex + 1] : argv[0];
  const allowed = new Set(CATALOG_WORKERS.map((worker) => worker.section));
  if (!allowed.has(section as CatalogWorkerSection)) {
    throw new Error(
      `Usage: tsx scripts/catalog-worker.ts --section ${CATALOG_WORKERS.map(
        (worker) => worker.section
      ).join("|")}`
    );
  }
  return section as CatalogWorkerSection;
}

loadEnvFile(path.join(adminRoot, ".env.production"));
loadEnvFile(path.join(adminRoot, ".env.local"));
loadEnvFile(path.join(adminRoot, ".env"));
process.chdir(adminRoot);

runCatalogWorker(parseSection(process.argv.slice(2))).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
