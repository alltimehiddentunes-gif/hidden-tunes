export type MaturePodcastSeed = {
  id: string;
  title: string;
  publisher: string;
  description: string;
  feedUrl: string;
  artworkUrl?: string;
  isExplicit: true;
  matureLevel: "explicit" | "adult";
  categories: string[];
  keywords: string[];
};

export const MATURE_PODCAST_SEEDS: MaturePodcastSeed[] = [
  {
    id: "mature-ht-after-dark",
    title: "After Dark Conversations",
    publisher: "Hidden Tunes Originals",
    description:
      "Unfiltered adult talk about love, dating, and modern relationships with Hidden Tunes hosts.",
    feedUrl: "https://feeds.hiddentunes.com/podcasts/after-dark-conversations",
    artworkUrl: "https://admin.hiddentunes.com/artwork/podcasts/after-dark.jpg",
    isExplicit: true,
    matureLevel: "adult",
    categories: ["mature-relationships", "all-mature"],
    keywords: ["adult", "relationship", "relationships", "dating", "love", "explicit"],
  },
  {
    id: "mature-ht-loveline-unfiltered",
    title: "Loveline Unfiltered",
    publisher: "Hidden Tunes Relationships",
    description:
      "Honest relationship advice, dating culture, and love stories for adult listeners.",
    feedUrl: "https://feeds.hiddentunes.com/podcasts/loveline-unfiltered",
    isExplicit: true,
    matureLevel: "explicit",
    categories: ["mature-relationships", "all-mature"],
    keywords: ["love", "relationships", "dating", "explicit", "adult", "erotic"],
  },
  {
    id: "mature-ht-modern-couples",
    title: "Modern Couples After Hours",
    publisher: "Hidden Tunes Relationships",
    description:
      "Late-night conversations about marriage, intimacy, and rebuilding connection.",
    feedUrl: "https://feeds.hiddentunes.com/podcasts/modern-couples-after-hours",
    isExplicit: true,
    matureLevel: "adult",
    categories: ["mature-relationships", "all-mature"],
    keywords: ["relationship", "marriage", "love", "adult", "intimacy"],
  },
  {
    id: "mature-ht-comedy-uncensored",
    title: "Comedy Uncensored",
    publisher: "Hidden Tunes Comedy",
    description:
      "Adult comedy without the bleeps — explicit stand-up stories and late-night humor.",
    feedUrl: "https://feeds.hiddentunes.com/podcasts/comedy-uncensored",
    isExplicit: true,
    matureLevel: "explicit",
    categories: ["adult-comedy", "all-mature"],
    keywords: ["comedy", "adult", "explicit", "humor", "uncensored"],
  },
  {
    id: "mature-ht-after-midnight-laughs",
    title: "After Midnight Laughs",
    publisher: "Hidden Tunes Comedy",
    description:
      "Explicit comedy panels and adult humor for grown-up Hidden Tunes listeners.",
    feedUrl: "https://feeds.hiddentunes.com/podcasts/after-midnight-laughs",
    isExplicit: true,
    matureLevel: "adult",
    categories: ["adult-comedy", "all-mature"],
    keywords: ["comedy", "adult", "explicit", "late-night"],
  },
  {
    id: "mature-ht-body-talk",
    title: "Body Talk Education",
    publisher: "Hidden Tunes Wellness",
    description:
      "Sex-positive education, consent, and adult health conversations without shame.",
    feedUrl: "https://feeds.hiddentunes.com/podcasts/body-talk-education",
    isExplicit: true,
    matureLevel: "adult",
    categories: ["sex-education", "all-mature"],
    keywords: ["sex", "education", "adult", "health", "relationships"],
  },
  {
    id: "mature-ht-intimacy-lab",
    title: "The Intimacy Lab",
    publisher: "Hidden Tunes Wellness",
    description:
      "Evidence-informed sex education and relationship skills for adult listeners.",
    feedUrl: "https://feeds.hiddentunes.com/podcasts/intimacy-lab",
    isExplicit: true,
    matureLevel: "explicit",
    categories: ["sex-education", "all-mature"],
    keywords: ["sex", "education", "intimacy", "explicit", "adult", "love"],
  },
  {
    id: "mature-ht-raw-stories",
    title: "Raw Stories: Unfiltered",
    publisher: "Hidden Tunes Stories",
    description:
      "Explicit interviews and real-life adult stories told without censorship.",
    feedUrl: "https://feeds.hiddentunes.com/podcasts/raw-stories-unfiltered",
    isExplicit: true,
    matureLevel: "explicit",
    categories: ["explicit-interviews", "all-mature"],
    keywords: ["explicit", "interviews", "adult", "stories", "raw"],
  },
  {
    id: "mature-ht-no-filter-guests",
    title: "No Filter Guests",
    publisher: "Hidden Tunes Stories",
    description:
      "Long-form explicit interviews with creators, couples, and culture voices.",
    feedUrl: "https://feeds.hiddentunes.com/podcasts/no-filter-guests",
    isExplicit: true,
    matureLevel: "adult",
    categories: ["explicit-interviews", "all-mature"],
    keywords: ["explicit", "interviews", "adult", "comedy", "culture"],
  },
];
