import assert from "node:assert/strict";

import { classifyMotivationContent } from "../lib/motivationContentClassifier";

function testAcceptMotivationalSpeech() {
  const result = classifyMotivationContent({
    title: "Motivational Speech on Resilience",
    description: "An inspirational keynote about overcoming adversity and personal growth.",
    tags: ["motivation", "speech"],
  });
  assert.equal(result.decision, "accept");
}

function testAcceptLeadershipKeynote() {
  const result = classifyMotivationContent({
    title: "Leadership Keynote: Building Confidence",
    description: "Business motivation and success mindset for entrepreneurs.",
  });
  assert.equal(result.decision, "accept");
}

function testRouteMitCourse() {
  const result = classifyMotivationContent({
    title: "MIT15.969F04 Analytics of Finance",
    description: "Lecture series for the full academic course.",
    subjects: ["course", "lecture 1"],
  });
  assert.equal(result.decision, "route_lectures");
}

function testRouteLectureSeries() {
  const result = classifyMotivationContent({
    title: "Programming Tutorial Lecture Series",
    description: "Computer science course classroom recording.",
  });
  assert.equal(result.decision, "route_lectures");
}

function testRoutePodcastEpisode() {
  const result = classifyMotivationContent({
    title: "Weekly Show Podcast Episode 12",
    description: "Hosted conversation series RSS episode.",
  });
  assert.equal(result.decision, "route_podcasts");
}

function testRouteFeatureFilm() {
  const result = classifyMotivationContent({
    title: "Inspirational Feature Film",
    description: "Full movie documentary serial.",
  });
  assert.ok(result.decision === "route_films" || result.decision === "hold");
}

function testRejectPlaylist() {
  const result = classifyMotivationContent({
    title: "Motivation Playlist Collection",
    description: "Video archive of generic videos.",
  });
  assert.equal(result.decision, "reject");
}

function testRejectTrailer() {
  const result = classifyMotivationContent({
    title: "Success Mindset Trailer",
    description: "Commercial advertisement promo reel.",
  });
  assert.equal(result.decision, "reject");
}

function testRejectMachineTitle() {
  const result = classifyMotivationContent({
    title: "video_001",
    description: "Sample test entry.",
  });
  assert.equal(result.decision, "reject");
}

function testHoldMixedUniversitySpeech() {
  const result = classifyMotivationContent({
    title: "MIT Commencement Motivational Speech",
    description: "University keynote with lecture 2 references and personal growth themes.",
  });
  assert.ok(["accept", "hold"].includes(result.decision));
}

function main() {
  testAcceptMotivationalSpeech();
  testAcceptLeadershipKeynote();
  testRouteMitCourse();
  testRouteLectureSeries();
  testRoutePodcastEpisode();
  testRouteFeatureFilm();
  testRejectPlaylist();
  testRejectTrailer();
  testRejectMachineTitle();
  testHoldMixedUniversitySpeech();
  console.log(JSON.stringify({ ok: true, tests: 10 }, null, 2));
}

main();
