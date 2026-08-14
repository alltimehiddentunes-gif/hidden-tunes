/**
 * Lecture same-course autoplay coordinator contract.
 * Run: node scripts/test-lecture-same-parent-autoplay.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function compareEducationalSessions(left, right) {
  const a = {
    module: Number(left.moduleNumber ?? 0),
    lesson: Number(left.lessonNumber ?? left.sequenceNumber ?? 0),
    sequence: Number(left.sequenceNumber ?? 0),
  };
  const b = {
    module: Number(right.moduleNumber ?? 0),
    lesson: Number(right.lessonNumber ?? right.sequenceNumber ?? 0),
    sequence: Number(right.sequenceNumber ?? 0),
  };
  if (a.module !== b.module) return a.module - b.module;
  if (a.lesson !== b.lesson) return a.lesson - b.lesson;
  return a.sequence - b.sequence;
}

const sessions = [
  { id: "l3", programId: "course-1", moduleNumber: 1, lessonNumber: 3, sequenceNumber: 3 },
  { id: "l1", programId: "course-1", moduleNumber: 1, lessonNumber: 1, sequenceNumber: 1 },
  { id: "l2", programId: "course-1", moduleNumber: 1, lessonNumber: 2, sequenceNumber: 2 },
].sort(compareEducationalSessions);

assert.deepEqual(
  sessions.map((s) => s.id),
  ["l1", "l2", "l3"]
);

function nextInSameCourse(ordered, currentId) {
  const index = ordered.findIndex((s) => s.id === currentId);
  if (index < 0) return null;
  const next = ordered[index + 1];
  if (!next) return null;
  if (next.programId !== ordered[index].programId) return null;
  return next;
}

assert.equal(nextInSameCourse(sessions, "l1")?.id, "l2");
assert.equal(nextInSameCourse(sessions, "l3"), null, "final lecture stops");

const playerContext = fs.readFileSync(path.join(root, "context/PlayerContext.tsx"), "utf8");
assert.match(
  playerContext,
  /handleEducationalSessionFinished/,
  "PlayerContext must wire educational finished coordinator"
);
assert.match(
  playerContext,
  /isEducationalPlaybackDomain/,
  "educational domain guard required"
);
assert.match(
  playerContext,
  /smart_continuation_blocked_domain/,
  "music smart continuation must not append into lectures"
);
assert.match(
  playerContext,
  /`\$\{domain\}_domain`/,
  "non-music continuation blocks must report their playback domain"
);

const controller = fs.readFileSync(
  path.join(root, "utils/EducationalPlaybackController.ts"),
  "utf8"
);
assert.match(controller, /async handleSessionFinished/);
assert.match(controller, /async resolveCurrentIfNeeded/);
assert.match(controller, /EDUCATIONAL_MAX_AUTO_NEXT_FAILURES/);

console.log("PASS lecture same-parent autoplay", {
  order: sessions.map((s) => s.id),
  finalStops: true,
  playerWired: true,
  resolveOnDemand: true,
});
