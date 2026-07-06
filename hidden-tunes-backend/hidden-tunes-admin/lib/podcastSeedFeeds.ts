export type PodcastSeedCategorySlug =
  | "health"
  | "technology"
  | "business"
  | "education"
  | "science"
  | "history"
  | "news"
  | "comedy"
  | "faith"
  | "music"
  | "society-culture"
  | "true-crime"
  | "sports";

export type PodcastSeedFeed = {
  title: string;
  feedUrl: string;
  category: PodcastSeedCategorySlug;
  publisher?: string;
};

export type MaturePodcastSeedCategorySlug =
  | "relationships"
  | "dating"
  | "intimacy-education"
  | "adult-lifestyle"
  | "confessions-stories"
  | "wellness-18"
  | "mature-comedy"
  | "mature-talk-shows";

export type MaturePodcastSeedFeed = {
  showSlug: string;
  title: string;
  feedUrl: string;
  category: PodcastSeedCategorySlug;
  matureCategory: MaturePodcastSeedCategorySlug;
  publisher?: string;
};

export const MATURE_PODCAST_SEED_FEEDS: MaturePodcastSeedFeed[] = [
  {
    showSlug: "mature-call-her-daddy",
    title: "Call Her Daddy",
    feedUrl: "https://feeds.simplecast.com/mKn_QmLS",
    category: "comedy",
    matureCategory: "dating",
    publisher: "Alex Cooper",
  },
  {
    showSlug: "mature-girls-gotta-eat",
    title: "Girls Gotta Eat",
    feedUrl: "https://feeds.megaphone.fm/DEARMEDIALLC6497520465",
    category: "comedy",
    matureCategory: "dating",
    publisher: "Dear Media",
  },
  {
    showSlug: "mature-why-wont-you-date-me",
    title: "Why Won't You Date Me?",
    feedUrl: "https://rss.art19.com/why-wont-you-date-me",
    category: "comedy",
    matureCategory: "mature-comedy",
    publisher: "Nicole Byer",
  },
  {
    showSlug: "mature-whoreible-decisions",
    title: "Whoreible Decisions",
    feedUrl: "https://omny.fm/shows/whoreible-decisions-1/playlists/podcast.rss",
    category: "comedy",
    matureCategory: "mature-comedy",
    publisher: "Mandii B & Weezy WTF",
  },
  {
    showSlug: "mature-off-topic",
    title: "Off Topic",
    feedUrl: "https://feeds.megaphone.fm/offtopic",
    category: "comedy",
    matureCategory: "mature-talk-shows",
    publisher: "The Achievement Hunter Crew",
  },
];

/** Legal public RSS feeds grouped by Hidden Tunes category slug. */
export const PODCAST_SEED_FEEDS: PodcastSeedFeed[] = [
  // health
  {
    title: "Huberman Lab",
    feedUrl: "https://feeds.megaphone.fm/hubermanlab",
    category: "health",
    publisher: "Scicomm Media",
  },
  {
    title: "Life Kit",
    feedUrl: "https://feeds.npr.org/510338/podcast.xml",
    category: "health",
    publisher: "NPR",
  },
  {
    title: "The Doctor's Farmacy",
    feedUrl: "https://feeds.megaphone.fm/thedoctorsfarmacy",
    category: "health",
    publisher: "Dr. Mark Hyman",
  },
  {
    title: "Feel Better, Live More",
    feedUrl: "https://feeds.megaphone.fm/feelbetterlivemore",
    category: "health",
    publisher: "Dr. Rangan Chatterjee",
  },

  // technology
  {
    title: "Syntax",
    feedUrl: "https://feed.syntax.fm/rss",
    category: "technology",
    publisher: "Syntax",
  },
  {
    title: "Lex Fridman Podcast",
    feedUrl: "https://lexfridman.com/feed/podcast/",
    category: "technology",
    publisher: "Lex Fridman",
  },
  {
    title: "Accidental Tech Podcast",
    feedUrl: "https://atp.fm/episodes?format=rss",
    category: "technology",
    publisher: "ATP",
  },
  {
    title: "Darknet Diaries",
    feedUrl: "https://feeds.megaphone.fm/darknetdiaries",
    category: "technology",
    publisher: "Jack Rhysider",
  },

  // business
  {
    title: "Planet Money",
    feedUrl: "https://feeds.npr.org/510289/podcast.xml",
    category: "business",
    publisher: "NPR",
  },
  {
    title: "How I Built This",
    feedUrl: "https://feeds.npr.org/510313/podcast.xml",
    category: "business",
    publisher: "NPR",
  },
  {
    title: "The Indicator from Planet Money",
    feedUrl: "https://feeds.npr.org/510325/podcast.xml",
    category: "business",
    publisher: "NPR",
  },
  {
    title: "WorkLife with Adam Grant",
    feedUrl: "https://feeds.simplecast.com/gFr3v8f2",
    category: "business",
    publisher: "TED",
  },

  // education
  {
    title: "Hidden Brain",
    feedUrl: "https://feeds.simplecast.com/kwWc0lhf",
    category: "education",
    publisher: "NPR",
  },
  {
    title: "TED Talks Daily",
    feedUrl: "https://feeds.feedburner.com/TEDTalks_audio",
    category: "education",
    publisher: "TED",
  },
  {
    title: "Freakonomics Radio",
    feedUrl: "https://feeds.simplecast.com/Y8lFbOT4",
    category: "education",
    publisher: "Freakonomics Radio",
  },
  {
    title: "Philosophize This!",
    feedUrl: "https://feeds.feedburner.com/philosophizethis",
    category: "education",
    publisher: "Stephen West",
  },

  // science
  {
    title: "Science Vs",
    feedUrl: "https://feeds.megaphone.fm/sciencevs",
    category: "science",
    publisher: "Spotify Studios",
  },
  {
    title: "Short Wave",
    feedUrl: "https://feeds.npr.org/510351/podcast.xml",
    category: "science",
    publisher: "NPR",
  },
  {
    title: "Ologies with Alie Ward",
    feedUrl: "https://feeds.simplecast.com/4T39_jAj",
    category: "science",
    publisher: "Alie Ward",
  },
  {
    title: "Science Friday",
    feedUrl: "https://www.sciencefriday.com/feed/podcast/science-friday/",
    category: "science",
    publisher: "Science Friday",
  },

  // history
  {
    title: "Stuff You Missed in History Class",
    feedUrl:
      "https://omny.fm/shows/stuff-you-missed-in-history-class/playlists/podcast.rss",
    category: "history",
    publisher: "iHeartPodcasts",
  },
  {
    title: "Throughline",
    feedUrl: "https://feeds.npr.org/510333/podcast.xml",
    category: "history",
    publisher: "NPR",
  },
  {
    title: "Revisionist History",
    feedUrl:
      "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/0e563f45-9d14-4ce8-8ef0-ae32006cd7e7/0d4cc74d-fff7-4b89-8818-ae32006cd7f0/podcast.rss",
    category: "history",
    publisher: "Pushkin Industries",
  },
  {
    title: "You're Wrong About",
    feedUrl: "https://rss.buzzsprout.com/1112270.rss",
    category: "history",
    publisher: "Campside Media",
  },

  // news
  {
    title: "Up First",
    feedUrl: "https://feeds.npr.org/510318/podcast.xml",
    category: "news",
    publisher: "NPR",
  },
  {
    title: "NPR News Now",
    feedUrl: "https://feeds.npr.org/500005/podcast.xml",
    category: "news",
    publisher: "NPR",
  },
  {
    title: "BBC Global News Podcast",
    feedUrl: "https://podcasts.files.bbci.co.uk/p02nq0gn.rss",
    category: "news",
    publisher: "BBC World Service",
  },
  {
    title: "The Daily",
    feedUrl: "https://feeds.simplecast.com/54nAGcIl",
    category: "news",
    publisher: "The New York Times",
  },

  // comedy
  {
    title: "Conan O'Brien Needs A Friend",
    feedUrl: "https://feeds.simplecast.com/dHoohVNH",
    category: "comedy",
    publisher: "Team Coco",
  },
  {
    title: "Comedy Bang Bang",
    feedUrl: "https://rss.art19.com/comedy-bang-bang",
    category: "comedy",
    publisher: "Earwolf",
  },
  {
    title: "Wait Wait... Don't Tell Me!",
    feedUrl: "https://feeds.npr.org/510282/podcast.xml",
    category: "comedy",
    publisher: "NPR",
  },
  {
    title: "My Brother, My Brother And Me",
    feedUrl: "https://feeds.simplecast.com/wjQvYtdl",
    category: "comedy",
    publisher: "The McElroys",
  },

  // faith
  {
    title: "The Bible in a Year",
    feedUrl: "https://feeds.fireside.fm/bibleinayear/rss",
    category: "faith",
    publisher: "Ascension",
  },
  {
    title: "Pray As You Go",
    feedUrl: "https://pray-as-you-go.org/podcasts/feed/",
    category: "faith",
    publisher: "Jesuits in Britain",
  },
  {
    title: "Joyce Meyer Enjoying Everyday Life",
    feedUrl: "https://feeds.feedburner.com/joycemeyer/SFiE",
    category: "faith",
    publisher: "Joyce Meyer Ministries",
  },
  {
    title: "Elevation with Steven Furtick",
    feedUrl:
      "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/cbb40a38-726f-4243-a86e-b0ed01477640/ff9164b2-aa64-410d-9ee1-b0ed0147765c/podcast.rss",
    category: "faith",
    publisher: "Elevation Church",
  },

  // music
  {
    title: "Song Exploder",
    feedUrl: "https://feed.songexploder.net/",
    category: "music",
    publisher: "Hrishikesh Hirway",
  },
  {
    title: "All Songs Considered",
    feedUrl: "https://feeds.npr.org/510019/podcast.xml",
    category: "music",
    publisher: "NPR",
  },
  {
    title: "Dissect",
    feedUrl: "https://feeds.megaphone.fm/dissect",
    category: "music",
    publisher: "Spotify Studios",
  },
  {
    title: "Switched on Pop",
    feedUrl: "https://feeds.megaphone.fm/switchedonpop",
    category: "music",
    publisher: "Vox Media Podcast Network",
  },

  // society
  {
    title: "This American Life",
    feedUrl: "https://feed.thisamericanlife.org/talpodcast",
    category: "society-culture",
    publisher: "This American Life",
  },
  {
    title: "Stuff You Should Know",
    feedUrl:
      "https://omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/A91018A4-EA4F-4130-BF55-AE270180C327/44710ECC-10BB-48D1-93C7-AE270180C33E/podcast.rss",
    category: "society-culture",
    publisher: "iHeartPodcasts",
  },
  {
    title: "Serial",
    feedUrl: "https://feeds.simplecast.com/xl36XBC2",
    category: "society-culture",
    publisher: "Serial Productions",
  },
  {
    title: "Code Switch",
    feedUrl: "https://feeds.npr.org/510312/podcast.xml",
    category: "society-culture",
    publisher: "NPR",
  },

  // true-crime
  {
    title: "Crime Junkie",
    feedUrl: "https://feeds.simplecast.com/qm_9xx0g",
    category: "true-crime",
    publisher: "audiochuck",
  },
  {
    title: "Casefile True Crime",
    feedUrl: "https://feeds.acast.com/public/shows/casefile-true-crime",
    category: "true-crime",
    publisher: "Casefile Presents",
  },
  {
    title: "Criminal",
    feedUrl: "https://feeds.megaphone.fm/VMP7924981569",
    category: "true-crime",
    publisher: "Vox Media Podcast Network",
  },
  {
    title: "My Favorite Murder",
    feedUrl:
      "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/bdde8bb3-169d-43b1-91d3-b24c0047969c/f450d41f-16bc-4ecd-8f6c-b24c004796e2/podcast.rss",
    category: "true-crime",
    publisher: "Exactly Right",
  },

  // sports
  {
    title: "The Bill Barnwell Show",
    feedUrl: "https://feeds.megaphone.fm/ESP4493005942",
    category: "sports",
    publisher: "ESPN",
  },
  {
    title: "ESPN Daily",
    feedUrl: "https://feeds.megaphone.fm/ESP8348692127",
    category: "sports",
    publisher: "ESPN",
  },
  {
    title: "Pardon My Take",
    feedUrl: "https://mcsorleys.barstoolsports.com/feed/pardon-my-take",
    category: "sports",
    publisher: "Barstool Sports",
  },
  {
    title: "The Mina Kimes Show Featuring Lenny",
    feedUrl: "https://feeds.megaphone.fm/ESP8957020927",
    category: "sports",
    publisher: "ESPN",
  },
];

export function listPodcastSeedFeeds(options?: {
  categories?: PodcastSeedCategorySlug[];
  limit?: number;
  offset?: number;
}) {
  let feeds = PODCAST_SEED_FEEDS;

  if (options?.categories?.length) {
    const allowed = new Set(options.categories);
    feeds = feeds.filter((feed) => allowed.has(feed.category));
  }

  const offset = Math.max(0, Math.floor(Number(options?.offset || 0)));
  const limit = Math.max(0, Math.floor(Number(options?.limit || 0)));

  if (offset > 0 || limit > 0) {
    feeds = feeds.slice(offset, limit > 0 ? offset + limit : undefined);
  }

  return feeds;
}

export function countPodcastSeedFeedsByCategory() {
  const counts: Record<string, number> = {};

  for (const feed of PODCAST_SEED_FEEDS) {
    counts[feed.category] = (counts[feed.category] || 0) + 1;
  }

  return counts;
}

export function listMaturePodcastSeedFeeds(options?: {
  categories?: MaturePodcastSeedCategorySlug[];
  limit?: number;
  offset?: number;
}) {
  let feeds = MATURE_PODCAST_SEED_FEEDS;

  if (options?.categories?.length) {
    const allowed = new Set(options.categories);
    feeds = feeds.filter((feed) => allowed.has(feed.matureCategory));
  }

  const offset = Math.max(0, Math.floor(Number(options?.offset || 0)));
  const limit = Math.max(0, Math.floor(Number(options?.limit || 0)));

  if (offset > 0 || limit > 0) {
    feeds = feeds.slice(offset, limit > 0 ? offset + limit : undefined);
  }

  return feeds;
}

export function countMaturePodcastSeedFeedsByCategory() {
  const counts: Record<string, number> = {};

  for (const feed of MATURE_PODCAST_SEED_FEEDS) {
    counts[feed.matureCategory] = (counts[feed.matureCategory] || 0) + 1;
  }

  return counts;
}
