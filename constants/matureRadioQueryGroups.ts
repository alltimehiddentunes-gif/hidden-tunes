export type MatureRadioQueryGroup = {
  id: string;
  title: string;
  subtitle: string;
  searchQueries: string[];
  tag?: string;
};

export const MATURE_RADIO_QUERY_GROUPS: MatureRadioQueryGroup[] = [
  {
    id: "late-night-radio",
    title: "Late Night Radio",
    subtitle: "After-hours talk and moody night stations",
    searchQueries: ["late night radio", "overnight talk radio", "midnight radio"],
    tag: "late night",
  },
  {
    id: "adult-talk",
    title: "Adult Talk",
    subtitle: "Grown-up conversation stations",
    searchQueries: ["adult talk radio", "mature talk radio", "explicit talk radio"],
    tag: "adult",
  },
  {
    id: "relationship-radio",
    title: "Relationship Radio",
    subtitle: "Love, couples, and connection on air",
    searchQueries: ["relationship radio", "love talk radio", "couples radio"],
    tag: "relationships",
  },
  {
    id: "dating-radio",
    title: "Dating Radio",
    subtitle: "Modern dating and singles talk",
    searchQueries: ["dating radio", "singles radio", "dating advice radio"],
    tag: "dating",
  },
  {
    id: "adult-comedy-radio",
    title: "Adult Comedy Radio",
    subtitle: "Uncensored humor and late-night comedy",
    searchQueries: ["adult comedy radio", "uncensored comedy radio", "comedy talk radio"],
    tag: "comedy",
  },
  {
    id: "psychology-radio",
    title: "Psychology Radio",
    subtitle: "Mind, behavior, and adult insight",
    searchQueries: ["psychology radio", "mental health talk radio", "therapy talk radio"],
    tag: "psychology",
  },
  {
    id: "call-in-shows",
    title: "Call-In Shows",
    subtitle: "Listener-driven talk and advice lines",
    searchQueries: ["call in radio", "phone in talk radio", "listener call radio"],
    tag: "talk",
  },
  {
    id: "unfiltered-talk",
    title: "Unfiltered Talk",
    subtitle: "Raw, honest, and uncensored stations",
    searchQueries: ["unfiltered talk radio", "uncensored talk radio", "no filter radio"],
    tag: "talk",
  },
  {
    id: "international-adult-radio",
    title: "International Adult Radio",
    subtitle: "Global mature stations across regions",
    searchQueries: ["international talk radio", "world talk radio adult", "global adult radio"],
    tag: "talk",
  },
];

const GROUP_BY_ID = new Map(MATURE_RADIO_QUERY_GROUPS.map((entry) => [entry.id, entry]));

export function getMatureRadioQueryGroup(id: string) {
  return GROUP_BY_ID.get(String(id || "").trim()) || null;
}

export function resolveMatureRadioQueryGroupId(categoryId: string) {
  const safe = String(categoryId || "").trim();
  if (safe === "adult" || safe === "mature") return "adult-talk";
  return safe;
}

export function countMatureRadioQuerySlots() {
  return MATURE_RADIO_QUERY_GROUPS.reduce((sum, group) => sum + group.searchQueries.length, 0);
}
