import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeSongFilters } from "../services/queryGuards.js";
import {
  MUSIC_TAXONOMY_FILTER_LIMITS,
  normalizeMusicTaxonomyFilters,
} from "../services/musicTaxonomyFilterUtils.js";

assert.deepEqual(normalizeSongFilters({ q: "afro", genre: "Afrobeat" }).taxonomy, {
  genre: ["afrobeat"],
});
assert.deepEqual(
  normalizeMusicTaxonomyFilters({
    subgenre: "  Deep House, Liquid DnB ",
    mood: "Café",
    regionalStyle: "West Africa",
    languages: Array.from({ length: 12 }, (_, index) => `lang-${index}`),
  }),
  {
    subgenre: ["deep-house", "liquid-dnb"],
    mood: ["cafe"],
    region: ["west-africa"],
    language: ["lang-0", "lang-1", "lang-2", "lang-3", "lang-4", "lang-5", "lang-6", "lang-7"],
  }
);
assert.equal(MUSIC_TAXONOMY_FILTER_LIMITS.maxValuesPerFilter, 8);
assert.deepEqual(normalizeSongFilters({}).taxonomy, {});
assert.equal(normalizeSongFilters({ genre: "rock" }).taxonomySchemaRequired, false);
assert.equal(normalizeSongFilters({ subgenre: "house" }).taxonomySchemaRequired, true);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const songsRoute = fs.readFileSync(path.join(root, "routes/songs.js"), "utf8");
assert.match(songsRoute, /resolveMusicTaxonomyTrackIds/);
assert.match(songsRoute, /request\.in\("id", taxonomyResolution\.trackIds\)/);
for (const key of ["genre", "subgenre", "mood", "region", "language", "activity", "era", "tempo"]) {
  assert.match(songsRoute + fs.readFileSync(path.join(root, "services/musicTaxonomyFilters.js"), "utf8"), new RegExp(key));
}

console.log("music-taxonomy-filters: PASS");
