/** Adjacent mature podcast groups used when a category returns sparse results. */
export const MATURE_PODCAST_ADJACENT_GROUPS: Record<string, string[]> = {
  dating: ["relationships", "lifestyle-18", "adult-talk"],
  relationships: ["dating", "marriage", "adult-talk"],
  marriage: ["relationships", "sexual-health", "adult-psychology"],
  "sexual-health": ["relationships", "marriage", "intimacy", "adult-psychology"],
  "adult-psychology": ["relationships", "sexual-health", "after-dark"],
  "after-dark": ["unfiltered-interviews", "real-stories", "adult-talk"],
  "adult-comedy": ["after-dark", "adult-talk", "unfiltered-interviews"],
  "real-stories": ["unfiltered-interviews", "after-dark", "adult-talk"],
  "unfiltered-interviews": ["real-stories", "after-dark", "adult-talk"],
  "lifestyle-18": ["dating", "relationships", "adult-talk"],
  "adult-talk": ["relationships", "dating", "after-dark"],
};

export function getMaturePodcastAdjacentGroupIds(groupId: string) {
  return MATURE_PODCAST_ADJACENT_GROUPS[String(groupId || "").trim()] || [];
}
