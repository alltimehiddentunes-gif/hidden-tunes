import assert from "node:assert/strict";

import { decodeHtmlEntities } from "../lib/audiobookDescriptionSanitizer";

assert.equal(
  decodeHtmlEntities("&amp; &quot; &apos; &lt; &gt;"),
  "& \" ' < >"
);
assert.equal(decodeHtmlEntities("&#1046; &#65;"), "Ж A");
assert.equal(decodeHtmlEntities("&#x416; &#x41;"), "Ж A");
assert.equal(decodeHtmlEntities("Прямой эфир — Москва"), "Прямой эфир — Москва");
assert.equal(decodeHtmlEntities("&unknown; &#xZZ; &#99999999;"), "&unknown; &#xZZ; &#99999999;");
assert.equal(decodeHtmlEntities("Rock & Roll"), "Rock & Roll");
assert.equal(decodeHtmlEntities("&amp;amp;"), "&amp;");

console.log("PASS: HTML entity decoder");
