/** Adjacent mature podcast groups used when a category returns sparse results. */
export const MATURE_PODCAST_ADJACENT_GROUPS: Record<string, string[]> = {
  dating: ["relationships", "love-advice", "lifestyle-18"],
  relationships: ["dating", "marriage", "love-advice"],
  marriage: ["relationships", "relationship-therapy", "intimacy-communication"],
  "breakups-divorce": ["relationships", "love-advice", "real-stories"],
  "sexual-health": ["intimacy-communication", "relationships", "adult-psychology"],
  "intimacy-communication": ["sexual-health", "relationships", "relationship-therapy"],
  "adult-psychology": ["human-behavior", "relationship-therapy", "relationships"],
  "human-behavior": ["adult-psychology", "relationships", "unfiltered-interviews"],
  "love-advice": ["dating", "relationships", "marriage"],
  "relationship-therapy": ["marriage", "intimacy-communication", "relationships"],
  "mens-issues": ["relationships", "adult-psychology", "late-night-talk"],
  "womens-issues": ["relationships", "love-advice", "sexual-health"],
  "lgbtq-conversations": ["relationships", "real-stories", "unfiltered-interviews"],
  "adult-comedy": ["late-night-talk", "after-dark-conversations", "confessions"],
  confessions: ["real-stories", "after-dark-conversations", "unfiltered-interviews"],
  "real-stories": ["confessions", "unfiltered-interviews", "after-dark-conversations"],
  "after-dark-conversations": ["late-night-talk", "confessions", "lifestyle-18"],
  "lifestyle-18": ["dating", "relationships", "after-dark-conversations"],
  "late-night-talk": ["after-dark-conversations", "adult-comedy", "unfiltered-interviews"],
  "unfiltered-interviews": ["real-stories", "confessions", "after-dark-conversations"],
};

export function getMaturePodcastAdjacentGroupIds(groupId: string) {
  return MATURE_PODCAST_ADJACENT_GROUPS[String(groupId || "").trim()] || [];
}
