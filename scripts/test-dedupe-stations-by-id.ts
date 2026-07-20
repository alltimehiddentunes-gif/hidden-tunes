import assert from "node:assert/strict";

import { dedupeStationsById } from "../utils/dedupeStationsById";

const DUP_ID = "8dfe70ef-92ee-40df-95c2-7768e9c4a770";

const input = [
  { id: DUP_ID, name: "A" },
  { id: "other-1", name: "B" },
  { id: DUP_ID, name: "A-dup" },
  { id: "other-2", name: "Same Name Different Id" },
  { id: "", name: "empty-a" },
  { id: null, name: "empty-b" },
  { id: "other-1", name: "B-dup" },
];

const unique = dedupeStationsById(input);

assert.equal(unique.length, 5);
assert.equal(unique.filter((row) => row.id === DUP_ID).length, 1);
assert.equal(unique[0]?.name, "A");
assert.equal(unique[1]?.id, "other-1");
assert.equal(unique[2]?.id, "other-2");
assert.equal(unique[3]?.name, "empty-a");
assert.equal(unique[4]?.name, "empty-b");

// Order of first occurrences preserved; same-name different IDs kept.
assert.deepEqual(
  unique.map((row) => String(row.id ?? "")),
  [DUP_ID, "other-1", "other-2", "", ""]
);

console.log("ok dedupeStationsById");
