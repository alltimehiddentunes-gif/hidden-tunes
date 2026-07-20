/**
 * Prove radio search URL never sends mature params that 500 production.
 * Run: npx tsx scripts/test-radio-search-no-mature-500.ts
 */
import { buildCatalogSearchUrl } from "../services/radio/radioCatalogApi";

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

function main() {
  const url = buildCatalogSearchUrl("south", 1, 40);
  assert(url.includes("q=south"), "has q");
  assert(url.includes("page=1"), "has page");
  assert(url.includes("limit=40"), "has limit");
  assert(url.includes("include_stream=1"), "has include_stream");
  assert(!url.includes("includeMature"), "no includeMature");
  assert(!url.includes("mature_enabled"), "no mature_enabled");
  assert(!url.includes("age_confirmed"), "no age_confirmed");
  console.log("radio-search-no-mature-500: ok", url);
}

main();
