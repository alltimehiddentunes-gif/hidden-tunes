export type TrendingChart = {
  id: string;
  title: string;
  query: string;
  emoji: string;
};

export const TRENDING_CHARTS: TrendingChart[] = [
  {
    id: "global",
    title: "Global Hits",
    query: "global music hits trending",
    emoji: "🌍",
  },
  {
    id: "afrobeats",
    title: "Afrobeats",
    query: "afrobeats trending songs",
    emoji: "🔥",
  },
  {
    id: "ghana",
    title: "Ghana Hits",
    query: "Ghana music trending songs",
    emoji: "🇬🇭",
  },
  {
    id: "nigeria",
    title: "Naija Hits",
    query: "Nigeria music trending songs",
    emoji: "🇳🇬",
  },
  {
    id: "amapiano",
    title: "Amapiano",
    query: "amapiano trending songs",
    emoji: "🎹",
  },
  {
    id: "rnb",
    title: "R&B",
    query: "rnb trending songs",
    emoji: "💜",
  },
  {
    id: "hiphop",
    title: "Hip-Hop",
    query: "hip hop trending songs",
    emoji: "🎤",
  },
  {
    id: "gospel",
    title: "Gospel",
    query: "gospel music trending songs",
    emoji: "🙏",
  },
];