export type MatureRadioQueryGroup = {
  id: string;
  title: string;
  subtitle: string;
  searchQueries: string[];
  tag?: string;
  /** When true, category is only shown if other groups fall below the station threshold. */
  mergeTarget?: boolean;
  /** When true, category is hidden individually when below the station threshold. */
  mergeWhenWeak?: boolean;
};

/** Primary mature radio rooms surfaced when they have enough playable streams. */
export const MATURE_RADIO_PRIMARY_GROUPS: MatureRadioQueryGroup[] = [
  {
    id: "adult-talk",
    title: "Adult Talk",
    subtitle: "Grown-up conversation stations",
    searchQueries: [
      "adult talk radio",
      "mature talk radio",
      "grown up talk radio",
      "relationship talk radio",
      "real talk radio",
    ],
    tag: "adult",
    mergeWhenWeak: true,
  },
  {
    id: "relationship-radio",
    title: "Relationship Radio",
    subtitle: "Love, couples, and connection on air",
    searchQueries: [
      "relationship radio",
      "love talk radio",
      "couples radio",
      "marriage talk radio",
      "relationship advice radio",
    ],
    tag: "relationships",
    mergeWhenWeak: true,
  },
  {
    id: "love-advice-radio",
    title: "Love Advice Radio",
    subtitle: "Romance and partnership on the airwaves",
    searchQueries: [
      "love advice radio",
      "romance talk radio",
      "dating advice radio",
      "love talk radio",
      "modern love radio",
    ],
    tag: "love",
    mergeWhenWeak: true,
  },
  {
    id: "late-night-radio",
    title: "Late Night Radio",
    subtitle: "After-hours talk and moody night stations",
    searchQueries: [
      "late night radio",
      "overnight talk radio",
      "midnight radio",
      "after dark radio",
      "night talk radio",
    ],
    tag: "late night",
    mergeWhenWeak: true,
  },
  {
    id: "call-in-shows",
    title: "Call-In Radio",
    subtitle: "Listener-driven talk and advice lines",
    searchQueries: [
      "call in radio",
      "phone in talk radio",
      "listener call radio",
      "advice line radio",
      "open line radio",
    ],
    tag: "talk",
    mergeWhenWeak: true,
  },
  {
    id: "psychology-radio",
    title: "Psychology Radio",
    subtitle: "Mind, behavior, and adult insight",
    searchQueries: [
      "psychology radio",
      "mental health talk radio",
      "therapy talk radio",
      "human behavior radio",
      "emotional intelligence radio",
    ],
    tag: "psychology",
    mergeWhenWeak: true,
  },
];

/** Supplementary groups whose inventory merges into mature talk when weak. */
export const MATURE_RADIO_SUPPLEMENT_GROUPS: MatureRadioQueryGroup[] = [
  {
    id: "dating-radio",
    title: "Dating Radio",
    subtitle: "Modern dating and singles talk",
    searchQueries: [
      "dating radio",
      "singles radio",
      "modern dating radio",
      "first dates radio",
      "dating talk radio",
    ],
    tag: "dating",
    mergeWhenWeak: true,
  },
  {
    id: "adult-comedy-radio",
    title: "Adult Comedy Radio",
    subtitle: "Uncensored humor and late-night comedy",
    searchQueries: [
      "adult comedy radio",
      "uncensored comedy radio",
      "comedy talk radio",
      "stand up comedy radio",
      "late night comedy radio",
    ],
    tag: "comedy",
    mergeWhenWeak: true,
  },
  {
    id: "unfiltered-talk",
    title: "Unfiltered Talk",
    subtitle: "Raw, honest, and uncensored stations",
    searchQueries: [
      "unfiltered talk radio",
      "uncensored talk radio",
      "no filter radio",
      "taboo talk radio",
      "honest talk radio",
    ],
    tag: "talk",
    mergeWhenWeak: true,
  },
  {
    id: "international-adult-radio",
    title: "International Adult Radio",
    subtitle: "Global mature stations across regions",
    searchQueries: [
      "international talk radio",
      "world talk radio adult",
      "global adult radio",
      "worldwide talk radio",
      "international relationship radio",
    ],
    tag: "talk",
    mergeWhenWeak: true,
  },
];

export const MATURE_RADIO_MERGED_TALK_ID = "mature-talk-radio";

export const MATURE_RADIO_MERGED_TALK_GROUP: MatureRadioQueryGroup = {
  id: MATURE_RADIO_MERGED_TALK_ID,
  title: "Mature Talk",
  subtitle: "Live grown-up conversation from across mature radio",
  searchQueries: [
    "adult talk radio",
    "relationship talk radio",
    "love advice radio",
    "dating talk radio",
    "late night talk radio",
    "call in talk radio",
    "psychology talk radio",
    "uncensored talk radio",
    "international talk radio",
    "comedy talk radio",
  ],
  tag: "talk",
  mergeTarget: true,
};

export const MATURE_RADIO_QUERY_GROUPS: MatureRadioQueryGroup[] = [
  ...MATURE_RADIO_PRIMARY_GROUPS,
  ...MATURE_RADIO_SUPPLEMENT_GROUPS,
  MATURE_RADIO_MERGED_TALK_GROUP,
];

const GROUP_BY_ID = new Map(MATURE_RADIO_QUERY_GROUPS.map((entry) => [entry.id, entry]));

export function getMatureRadioQueryGroup(id: string) {
  return GROUP_BY_ID.get(String(id || "").trim()) || null;
}

export function resolveMatureRadioQueryGroupId(categoryId: string) {
  const safe = String(categoryId || "").trim();
  if (safe === "adult" || safe === "mature") return "adult-talk";
  if (safe === MATURE_RADIO_MERGED_TALK_ID) return MATURE_RADIO_MERGED_TALK_ID;
  return safe;
}

export function countMatureRadioQuerySlots() {
  return MATURE_RADIO_QUERY_GROUPS.reduce((sum, group) => sum + group.searchQueries.length, 0);
}

export function getMatureRadioGroupsForAvailabilityProbe() {
  return [...MATURE_RADIO_PRIMARY_GROUPS, ...MATURE_RADIO_SUPPLEMENT_GROUPS];
}
