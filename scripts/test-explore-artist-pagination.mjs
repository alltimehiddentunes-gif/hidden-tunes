import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import vm from "node:vm";

const root = process.cwd();
const sourcePath = path.join(root, "utils", "exploreArtistPagination.ts");
const identityPath = path.join(root, "utils", "artistIdentity.ts");
const explorePath = path.join(root, "app", "worlds", "index.tsx");

function loadTsModule(filePath, mocks = {}) {
  const source = fs.readFileSync(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${output}\n})`, {
    console,
  })((id) => mocks[id] || loadTsModule(path.resolve(path.dirname(filePath), `${id}.ts`)), module, module.exports);
  return module.exports;
}

const identity = loadTsModule(identityPath);
const pagination = loadTsModule(sourcePath, { "./artistIdentity": identity });
const uuid = (suffix) => `10000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

assert.equal(pagination.EXPLORE_ARTIST_PAGE_SIZE, 6, "initial and subsequent requests use six artists");

const first = Array.from({ length: 6 }, (_, index) => ({ id: uuid(index + 1), name: `Artist ${index + 1}` }));
const initial = pagination.appendCanonicalArtistPage([], first);
assert.equal(initial.artists.length, 6);
assert.equal(
  JSON.stringify(initial.artists.map((artist) => artist.id)),
  JSON.stringify(first.map((artist) => artist.id))
);

const second = pagination.appendCanonicalArtistPage(initial.artists, [
  first[5],
  { id: uuid(7), name: "Artist 7" },
  { id: "not-a-uuid", name: "Invalid" },
  { id: uuid(8), name: "Artist 8" },
]);
assert.equal(second.artists.length, 8, "UUID duplicates and malformed identities are rejected");
assert.equal(second.rejectedCount, 2);
assert.equal(second.artists[6].name, "Artist 7", "backend order remains stable");

const inFlight = new Set([2]);
assert.equal(pagination.canRequestArtistPage({ page: 2, hasMore: true, inFlightPages: inFlight }), false);
assert.equal(pagination.canRequestArtistPage({ page: 3, hasMore: true, inFlightPages: inFlight }), true);
assert.equal(pagination.canRequestArtistPage({ page: 3, hasMore: false, inFlightPages: inFlight }), false);

const exploreSource = fs.readFileSync(explorePath, "utf8");
assert.match(exploreSource, /limit:\s*EXPLORE_ARTIST_PAGE_SIZE/);
assert.match(exploreSource, /onEndReached=\{\(\) =>/);
assert.match(exploreSource, /pathname:\s*"\/artist\/\[id\]"/);
assert.match(exploreSource, /numColumns=\{2\}/);
assert.doesNotMatch(exploreSource, /pathname:\s*"\/artist"\s*,\s*params:\s*\{\s*artist:/);

console.log("Explore artist pagination contracts passed.");
