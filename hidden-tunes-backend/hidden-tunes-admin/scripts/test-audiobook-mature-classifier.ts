import assert from "node:assert/strict";

import { classifyMatureAudiobookCandidate } from "@/lib/audiobookMature/classifier";

function main() {
  const accept = classifyMatureAudiobookCandidate({
    title: "Collected Erotic Short Stories",
    description: "Adult fiction erotica under a Creative Commons license.",
    categories: ["mature", "fiction"],
    sourceIsMatureLane: true,
  });
  assert.equal(accept.accept, true);
  assert.equal(accept.classification, "confirmed_mature");

  const rejectClassicOnMatureLane = classifyMatureAudiobookCandidate({
    title: "Frankenstein",
    description: "A classic gothic novel.",
    categories: ["horror"],
    sourceIsMatureLane: true,
  });
  assert.equal(rejectClassicOnMatureLane.accept, false);

  const rejectMinors = classifyMatureAudiobookCandidate({
    title: "Teen Romance Anthology",
    description: "Stories about underage characters.",
    sourceIsMatureLane: true,
  });
  assert.equal(rejectMinors.accept, false);
  assert.equal(rejectMinors.classification, "reject_minors");

  const rejectIllegal = classifyMatureAudiobookCandidate({
    title: "Unauthorized Collection",
    description: "Includes non-consensual and exploitative material.",
    sourceIsMatureLane: true,
  });
  assert.equal(rejectIllegal.accept, false);
  assert.equal(rejectIllegal.classification, "reject_illegal");

  console.log(
    JSON.stringify(
      {
        success: true,
        cases: ["confirmed_mature", "reject_minors", "reject_illegal"],
      },
      null,
      2
    )
  );
}

main();
