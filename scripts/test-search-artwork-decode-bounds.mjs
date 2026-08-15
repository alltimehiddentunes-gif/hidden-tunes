import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const searchSource = readFileSync(resolve(scriptDir, "../app/search.tsx"), "utf8");
const imageNodes = searchSource.match(/<HTImage\b[\s\S]*?\/>/g) || [];

assert.equal(imageNodes.length, 10, "Search must keep all ten artwork sites under the decode-bound contract");

for (const node of imageNodes) {
  assert.match(node, /maxDecodeWidth=\{SEARCH_[A-Z_]+\}/, `Missing bounded width:\n${node}`);
  assert.match(node, /maxDecodeHeight=\{SEARCH_[A-Z_]+\}/, `Missing bounded height:\n${node}`);
}

assert.match(searchSource, /const SEARCH_ROW_ARTWORK_DECODE_PX = 80;/);
assert.match(searchSource, /const SEARCH_ARTIST_ARTWORK_DECODE_PX = 128;/);
assert.match(searchSource, /const SEARCH_ALBUM_ARTWORK_DECODE_PX = 160;/);
assert.match(searchSource, /const SEARCH_ROOM_ARTWORK_DECODE_WIDTH_PX = 384;/);
assert.match(searchSource, /const SEARCH_ROOM_ARTWORK_DECODE_HEIGHT_PX = 300;/);

console.log("Search artwork decode bounds: PASS");
