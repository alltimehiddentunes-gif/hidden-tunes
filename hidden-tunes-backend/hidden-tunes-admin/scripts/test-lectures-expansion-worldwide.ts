import assert from "node:assert/strict";

import {
  LECTURE_EXPANSION_TARGET_PLAYABLE_ITEMS,
  LECTURE_EXPANSION_TARGET_PROGRAMS,
} from "@/lib/lecturesExpansion/constants";
import { mapSubjectToCategorySlug, coachingContinuationAffinity } from "@/lib/lecturesExpansion/categories";
import { classifyCoachingContent } from "@/lib/lecturesExpansion/coachingClassifier";
import { taskKey, isTaskExhausted, markTaskExhausted, createLectureExpansionState } from "@/lib/lecturesExpansion/checkpoint";
import { flattenSourceQueryTasks, listEnabledLectureSources } from "@/lib/lecturesExpansion/sourceRegistry";
import { isLectureExpansionTargetMet } from "@/lib/lecturesExpansion/status";
import { LECTURE_MAX_PAGE_SIZE } from "@/lib/lectureCatalog";

assert.equal(LECTURE_EXPANSION_TARGET_PROGRAMS, 25_000);
assert.equal(LECTURE_EXPANSION_TARGET_PLAYABLE_ITEMS, 50_000);
assert.equal(LECTURE_MAX_PAGE_SIZE, 40);

const mapped = mapSubjectToCategorySlug({
  title: "Career coaching workshop for professionals",
  description: "A structured coaching session with exercises.",
});
assert.equal(mapped.categorySlug, "coaching");

const coaching = classifyCoachingContent({
  title: "Executive leadership coaching masterclass",
  description: "Framework and guided exercises for leaders.",
  queryFamily: "executive leadership coaching",
});
assert.equal(coaching.isCoaching, true);
assert.equal(coaching.rejected, false);

const promo = classifyCoachingContent({
  title: "Buy my coaching package now",
  description: "Limited offer sign up today.",
});
assert.equal(promo.rejected, true);

assert.ok(coachingContinuationAffinity("grief-loss-coaching", "dating-coaching") < 0);
assert.ok(coachingContinuationAffinity("career-coaching", "leadership-coaching") > 0);

const state = createLectureExpansionState({ programs: 25_000, playable_items: 50_000 });
assert.equal(isTaskExhausted(state, "internet_archive_public_domain", "history lectures"), false);
markTaskExhausted(state, "internet_archive_public_domain", "history lectures");
assert.equal(isTaskExhausted(state, "internet_archive_public_domain", "history lectures"), true);
assert.equal(taskKey("a", "b"), "a::b");

assert.equal(
  isLectureExpansionTargetMet({
    public_programs: 25_000,
    public_playable_items: 50_000,
    audio_items: 15_000,
    video_items: 15_000,
    pending_items: 0,
    rejected_items: 0,
    coaching_programs: 100,
    coaching_playable_items: 200,
    coaching_audio_items: 100,
    coaching_video_items: 100,
    gap_programs: 0,
    gap_playable_items: 0,
  }),
  true
);

const sources = listEnabledLectureSources();
assert.ok(sources.length >= 2);
assert.ok(flattenSourceQueryTasks(sources[0]).length >= 1);

console.log("Lectures worldwide expansion foundation tests passed.");
