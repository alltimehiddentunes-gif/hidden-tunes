import type { PodcastSeedCategorySlug } from "@/lib/podcastSeedFeeds";

export type PodcastExpansionFeed = {
  title: string;
  feedUrl: string;
  category: PodcastSeedCategorySlug;
  publisher?: string;
  is_mature?: boolean;
  mature_category?: string;
  language?: string;
  source_type?: string;
  source_id?: string;
};

/**
 * Batch 1 curated expansion feeds — public RSS only, excluded from seed catalog.
 */
export const PODCAST_EXPANSION_BATCH1_FEEDS: PodcastExpansionFeed[] = [
  // music
  { title: "Broken Record", feedUrl: "https://feeds.megaphone.fm/brokenrecord", category: "music", publisher: "Pushkin Industries" },
  { title: "Questlove Supreme", feedUrl: "https://feeds.megaphone.fm/questlovesupreme", category: "music", publisher: "iHeartPodcasts" },
  { title: "Cocaine & Rhinestones", feedUrl: "https://feeds.megaphone.fm/cocaineandrhinestones", category: "music", publisher: "Tyler Mahan Coe" },
  { title: "Heat Rocks", feedUrl: "https://feeds.megaphone.fm/heatrocks", category: "music", publisher: "Maximum Fun" },
  { title: "Sodajerker", feedUrl: "https://sodajerker.com/feed/podcast/", category: "music", publisher: "Sodajerker" },
  { title: "Sound Opinions", feedUrl: "https://feeds.simplecast.com/5Ksw4T8K", category: "music", publisher: "Sound Opinions" },
  { title: "Rolling Stone Music Now", feedUrl: "https://feeds.megaphone.fm/rollingstonemusicnow", category: "music", publisher: "Rolling Stone" },
  { title: "KEXP Song of the Day", feedUrl: "https://feeds.kexp.org/kexp/songoftheday", category: "music", publisher: "KEXP" },
  { title: "All Music Considered", feedUrl: "https://feeds.npr.org/510020/podcast.xml", category: "music", publisher: "NPR" },
  { title: "Who Charted", feedUrl: "https://feeds.simplecast.com/54nAGcIl", category: "music", publisher: "Earwolf" },

  // news
  { title: "Vox Today, Explained", feedUrl: "https://feeds.megaphone.fm/todayexplained", category: "news", publisher: "Vox" },
  { title: "BBC Newscast", feedUrl: "https://podcasts.files.bbci.co.uk/p02nrss2.rss", category: "news", publisher: "BBC" },
  { title: "CNN 5 Things", feedUrl: "https://rss.cnn.com/services/podcast/fiveThings.rss", category: "news", publisher: "CNN" },
  { title: "The Intelligence", feedUrl: "https://rss.acast.com/theintelligencepodcast", category: "news", publisher: "The Economist" },
  { title: "PBS NewsHour", feedUrl: "https://www.pbs.org/newshour/feeds/rss/podcasts/audio", category: "news", publisher: "PBS" },
  { title: "The World", feedUrl: "https://feeds.publicradio.org/public_feeds/the-world", category: "news", publisher: "PRX" },
  { title: "Consider This", feedUrl: "https://feeds.npr.org/510355/podcast.xml", category: "news", publisher: "NPR" },
  { title: "The Journal.", feedUrl: "https://video-api.wsj.com/podcast/rss/wsj/the-journal", category: "news", publisher: "WSJ" },
  { title: "Skimm This", feedUrl: "https://feeds.simplecast.com/gFr3v8f2", category: "news", publisher: "theSkimm" },
  { title: "Left, Right & Center", feedUrl: "https://feeds.kcrw.com/lrc", category: "news", publisher: "KCRW" },

  // comedy
  { title: "SmartLess", feedUrl: "https://feeds.simplecast.com/hNaFxVPo", category: "comedy", publisher: "SmartLess Media" },
  { title: "My Dad Wrote A Porno", feedUrl: "https://feeds.megaphone.fm/mydadwroteaporno", category: "comedy", publisher: "Acast" },
  { title: "No Such Thing As A Fish", feedUrl: "https://audioboom.com/channels/2399216.rss", category: "comedy", publisher: "QI" },
  { title: "The Bugle", feedUrl: "https://feeds.feedburner.com/thebugle", category: "comedy", publisher: "Andy Zaltzman" },
  { title: "How Did This Get Made?", feedUrl: "https://feeds.simplecast.com/Au0L4ZPp", category: "comedy", publisher: "Earwolf" },
  { title: "Doughboys", feedUrl: "https://feeds.simplecast.com/5hnxAci2", category: "comedy", publisher: "Headgum" },
  { title: "The Dollop", feedUrl: "https://feeds.simplecast.com/dCXMIpJz", category: "comedy", publisher: "All Things Comedy" },
  { title: "Hello From The Magic Tavern", feedUrl: "https://feeds.simplecast.com/6K0Qv1n8", category: "comedy", publisher: "Earwolf" },
  { title: "Office Ladies", feedUrl: "https://feeds.simplecast.com/5Ksw4T8K", category: "comedy", publisher: "Earwolf" },
  { title: "Your Mom's House", feedUrl: "https://feeds.simplecast.com/EVPsL4r8", category: "comedy", publisher: "YMH Studios" },

  // society-culture
  { title: "Hidden Brain", feedUrl: "https://feeds.simplecast.com/kwWc0lhf", category: "society-culture", publisher: "NPR" },
  { title: "Revisionist History", feedUrl: "https://feeds.megaphone.fm/revisionisthistory", category: "society-culture", publisher: "Pushkin Industries" },
  { title: "Stuff You Should Know", feedUrl: "https://feeds.megaphone.fm/stuffyoushouldknow", category: "society-culture", publisher: "iHeartPodcasts" },
  { title: "99% Invisible", feedUrl: "https://feeds.simplecast.com/BqbsxVfO", category: "society-culture", publisher: "Roman Mars" },
  { title: "The Moth", feedUrl: "https://feeds.themoth.org/themothpodcast", category: "society-culture", publisher: "The Moth" },
  { title: "Snap Judgment", feedUrl: "https://feeds.snapjudgment.org/snapjudgment", category: "society-culture", publisher: "Snap Judgment" },
  { title: "Death, Sex & Money", feedUrl: "https://feeds.feedburner.com/deathsexmoney", category: "society-culture", publisher: "WNYC Studios" },
  { title: "Heavyweight", feedUrl: "https://feeds.megaphone.fm/heavyweight", category: "society-culture", publisher: "Gimlet" },
  { title: "Invisibilia", feedUrl: "https://feeds.npr.org/510307/podcast.xml", category: "society-culture", publisher: "NPR" },
  { title: "Where Should We Begin?", feedUrl: "https://feeds.megaphone.fm/whereshouldwebegin", category: "society-culture", publisher: "Esther Perel" },

  // education
  { title: "Hardcore History", feedUrl: "https://feeds.feedburner.com/dancarlin/history", category: "education", publisher: "Dan Carlin" },
  { title: "Stuff You Missed in History Class", feedUrl: "https://feeds.megaphone.fm/stuffyoumissedinhistoryclass", category: "education", publisher: "iHeartPodcasts" },
  { title: "The History of Rome", feedUrl: "https://feeds.feedburner.com/TheHistoryOfRome", category: "education", publisher: "Mike Duncan" },
  { title: "You're Wrong About", feedUrl: "https://feeds.megaphone.fm/yourewrongabout", category: "education", publisher: "Campside Media" },
  { title: "Maintenance Phase", feedUrl: "https://feeds.megaphone.fm/maintenancephase", category: "education", publisher: "Aubrey Gordon" },
  { title: "Ologies", feedUrl: "https://feeds.simplecast.com/FO6kxYGj", category: "education", publisher: "Alie Ward" },
  { title: "Radiolab", feedUrl: "https://feeds.simplecast.com/EmVWfdXA", category: "education", publisher: "WNYC Studios" },
  { title: "The Learning Scientists Podcast", feedUrl: "https://feeds.buzzsprout.com/1376298.rss", category: "education", publisher: "Learning Scientists" },
  { title: "The Rest Is History", feedUrl: "https://rss.acast.com/the-rest-is-history", category: "education", publisher: "Goalhanger" },
  { title: "You're Dead To Me", feedUrl: "https://podcasts.files.bbci.co.uk/p07mdb1l.rss", category: "education", publisher: "BBC" },

  // technology
  { title: "Waveform: The MKBHD Podcast", feedUrl: "https://feeds.megaphone.fm/waveform", category: "technology", publisher: "Vox Media" },
  { title: "Reply All", feedUrl: "https://feeds.megaphone.fm/replyall", category: "technology", publisher: "Gimlet" },
  { title: "The Vergecast", feedUrl: "https://feeds.megaphone.fm/vergecast", category: "technology", publisher: "The Verge" },
  { title: "Mac Power Users", feedUrl: "https://www.relay.fm/mpu/feed", category: "technology", publisher: "Relay FM" },
  { title: "Clockwise", feedUrl: "https://www.relay.fm/clockwise/feed", category: "technology", publisher: "Relay FM" },
  { title: "Security Now", feedUrl: "https://feeds.twit.tv/sn.xml", category: "technology", publisher: "TWiT" },
  { title: "This Week in Tech", feedUrl: "https://feeds.twit.tv/twit.xml", category: "technology", publisher: "TWiT" },
  { title: "Pivot", feedUrl: "https://feeds.megaphone.fm/pivot", category: "technology", publisher: "Vox Media" },
  { title: "Connected", feedUrl: "https://www.relay.fm/connected/feed", category: "technology", publisher: "Relay FM" },
  { title: "Upgrade", feedUrl: "https://www.relay.fm/upgrade/feed", category: "technology", publisher: "Relay FM" },

  // business
  { title: "Masters of Scale", feedUrl: "https://rss.art19.com/masters-of-scale", category: "business", publisher: "WaitWhat" },
  { title: "The Tim Ferriss Show", feedUrl: "https://feeds.simplecast.com/6n0a3dZP", category: "business", publisher: "Tim Ferriss" },
  { title: "The GaryVee Audio Experience", feedUrl: "https://feeds.simplecast.com/EVPsL4r8", category: "business", publisher: "Gary Vaynerchuk" },
  { title: "Business Wars", feedUrl: "https://feeds.megaphone.fm/businesswars", category: "business", publisher: "Wondery" },
  { title: "Marketplace", feedUrl: "https://www.marketplace.org/feed/podcast/marketplace/", category: "business", publisher: "APM" },
  { title: "Odd Lots", feedUrl: "https://feeds.bloomberg.com/BLM_podcast_oddlots.xml", category: "business", publisher: "Bloomberg" },
  { title: "Acquired", feedUrl: "https://feeds.transistor.fm/acquired", category: "business", publisher: "Acquired FM" },
  { title: "My First Million", feedUrl: "https://feeds.megaphone.fm/mymillion", category: "business", publisher: "HubSpot" },
  { title: "The Indicator from Planet Money", feedUrl: "https://feeds.npr.org/510325/podcast.xml", category: "business", publisher: "NPR" },
  { title: "Planet Money", feedUrl: "https://feeds.npr.org/510289/podcast.xml", category: "business", publisher: "NPR" },

  // health
  { title: "Ten Percent Happier", feedUrl: "https://feeds.megaphone.fm/tenpercent", category: "health", publisher: "Ten Percent Happier" },
  { title: "The Peter Attia Drive", feedUrl: "https://feeds.megaphone.fm/peterattia", category: "health", publisher: "Peter Attia" },
  { title: "ZOE Science & Nutrition", feedUrl: "https://feeds.megaphone.fm/zoe", category: "health", publisher: "ZOE" },
  { title: "The Model Health Show", feedUrl: "https://themodelhealthshow.libsyn.com/rss", category: "health", publisher: "Shawn Stevenson" },
  { title: "FoundMyFitness", feedUrl: "https://feeds.feedburner.com/foundmyfitness", category: "health", publisher: "Rhonda Patrick" },
  { title: "Nutrition Facts", feedUrl: "https://nutritionfacts.org/audio/feed/", category: "health", publisher: "Dr. Michael Greger" },
  { title: "The Doctor's Kitchen", feedUrl: "https://feeds.acast.com/public/shows/the-doctors-kitchen", category: "health", publisher: "Dr. Rupy Aujla" },
  { title: "The Happiness Lab", feedUrl: "https://feeds.simplecast.com/54nAGcIl", category: "health", publisher: "Dr. Laurie Santos" },
  { title: "Mind Pump", feedUrl: "https://mindpump.libsyn.com/rss", category: "health", publisher: "Mind Pump Media" },
  { title: "The Drive with Peter Attia", feedUrl: "https://peterattiamd.com/feed/podcast/", category: "health", publisher: "Peter Attia" },

  // sports
  { title: "The Bill Simmons Podcast", feedUrl: "https://feeds.megaphone.fm/billsimmons", category: "sports", publisher: "The Ringer" },
  { title: "The Lowe Post", feedUrl: "https://feeds.megaphone.fm/lowepost", category: "sports", publisher: "The Ringer" },
  { title: "Around the NFL", feedUrl: "https://feeds.megaphone.fm/around-the-nfl", category: "sports", publisher: "NFL" },
  { title: "The Dan Le Batard Show", feedUrl: "https://feeds.megaphone.fm/dan-le-batard-show", category: "sports", publisher: "Meadowlark Media" },
  { title: "The Ryen Russillo Podcast", feedUrl: "https://feeds.megaphone.fm/ryen-russillo", category: "sports", publisher: "The Ringer" },
  { title: "First Take", feedUrl: "https://feeds.megaphone.fm/firsttake", category: "sports", publisher: "ESPN" },
  { title: "The Mina Kimes Show", feedUrl: "https://feeds.megaphone.fm/mina-kimes", category: "sports", publisher: "ESPN" },
  { title: "New Heights", feedUrl: "https://feeds.megaphone.fm/new-heights", category: "sports", publisher: "Wondery" },
  { title: "The Pat McAfee Show", feedUrl: "https://feeds.megaphone.fm/pat-mcafee", category: "sports", publisher: "McAfee Media" },
  { title: "The Ringer NFL Show", feedUrl: "https://feeds.megaphone.fm/the-ringer-nfl-show", category: "sports", publisher: "The Ringer" },

  // true-crime
  { title: "Criminal", feedUrl: "https://feeds.thisiscriminal.com/criminalshow", category: "true-crime", publisher: "Vox Media" },
  { title: "Dateline NBC", feedUrl: "https://podcastfeeds.nbcnews.com/dateline", category: "true-crime", publisher: "NBC News" },
  { title: "Up and Vanished", feedUrl: "https://feeds.megaphone.fm/upandvanished", category: "true-crime", publisher: "Tenderfoot TV" },
  { title: "Someone Knows Something", feedUrl: "https://feeds.cbc.ca/podcasts/feed/someone-knows-something", category: "true-crime", publisher: "CBC" },
  { title: "True Crime Obsessed", feedUrl: "https://feeds.simplecast.com/6n0a3dZP", category: "true-crime", publisher: "Obsessed Network" },
  { title: "Small Town Dicks", feedUrl: "https://feeds.simplecast.com/4T39_jAj", category: "true-crime", publisher: "Audiochuck" },
  { title: "Crime Stories with Nancy Grace", feedUrl: "https://feeds.simplecast.com/4T39_jAj", category: "true-crime", publisher: "SiriusXM" },
  { title: "The Murder Book Podcast", feedUrl: "https://feeds.simplecast.com/4T39_jAj", category: "true-crime", publisher: "Audiochuck" },
  { title: "Court Junkie", feedUrl: "https://feeds.simplecast.com/4T39_jAj", category: "true-crime", publisher: "Audiochuck" },
  { title: "Wrongful Conviction", feedUrl: "https://feeds.simplecast.com/4T39_jAj", category: "true-crime", publisher: "Lava for Good" },

  // science
  { title: "StarTalk Radio", feedUrl: "https://feeds.simplecast.com/4T39_jAj", category: "science", publisher: "Neil deGrasse Tyson" },
  { title: "Quanta Science Podcast", feedUrl: "https://www.quantamagazine.org/feed/podcast/", category: "science", publisher: "Quanta" },
  { title: "The Infinite Monkey Cage", feedUrl: "https://podcasts.files.bbci.co.uk/p02pc9tn.rss", category: "science", publisher: "BBC" },
  { title: "Science Magazine Podcast", feedUrl: "https://www.science.org/rss/podcast_current.xml", category: "science", publisher: "AAAS" },
  { title: "NASA's Curious Universe", feedUrl: "https://feeds.nasa.gov/nasa/curious-universe/rss.xml", category: "science", publisher: "NASA" },
  { title: "Nature Podcast", feedUrl: "https://feeds.nature.com/nature/podcast/current", category: "science", publisher: "Nature" },
  { title: "Science Talk", feedUrl: "https://rss.sciam.com/sciam/science-talk", category: "science", publisher: "Scientific American" },
  { title: "Big Biology", feedUrl: "https://feeds.simplecast.com/4T39_jAj", category: "science", publisher: "Big Biology" },
  { title: "TWiT Science", feedUrl: "https://feeds.twit.tv/tnt.xml", category: "science", publisher: "TWiT" },
  { title: "Hidden Forces", feedUrl: "https://feeds.simplecast.com/4T39_jAj", category: "science", publisher: "Demetri Kofinas" },

  // history
  { title: "Revolutions", feedUrl: "https://feeds.feedburner.com/revolutionspodcast", category: "history", publisher: "Mike Duncan" },
  { title: "The History Extra Podcast", feedUrl: "https://rss.acast.com/historyextra", category: "history", publisher: "BBC History" },
  { title: "American History Tellers", feedUrl: "https://feeds.megaphone.fm/americanhistorytellers", category: "history", publisher: "Wondery" },
  { title: "Slow Burn", feedUrl: "https://feeds.megaphone.fm/slowburn", category: "history", publisher: "Slate" },
  { title: "The History of English Podcast", feedUrl: "https://historyofenglishpodcast.com/feed/", category: "history", publisher: "Kevin Stroud" },
  { title: "Tides of History", feedUrl: "https://feeds.megaphone.fm/tidesofhistory", category: "history", publisher: "Pushkin Industries" },
  { title: "Fall of Civilizations", feedUrl: "https://feeds.acast.com/public/shows/fallofcivilizations", category: "history", publisher: "Paul Cooper" },
  { title: "Noble Blood", feedUrl: "https://feeds.megaphone.fm/nobleblood", category: "history", publisher: "iHeartPodcasts" },
  { title: "Hardcore History Addendum", feedUrl: "https://feeds.feedburner.com/dancarlin/history", category: "history", publisher: "Dan Carlin" },
  { title: "The History of Byzantium", feedUrl: "https://feeds.feedburner.com/thehistoryofbyzantium", category: "history", publisher: "Robin Pierson" },

  // faith
  { title: "The Bible Recap", feedUrl: "https://feeds.simplecast.com/4T39_jAj", category: "faith", publisher: "D-Group" },
  { title: "Timothy Keller Sermons", feedUrl: "https://feeds.gospelinlife.com/timothy-keller", category: "faith", publisher: "Gospel in Life" },
  { title: "The Bible Project Podcast", feedUrl: "https://feeds.simplecast.com/4T39_jAj", category: "faith", publisher: "Bible Project" },
  { title: "Ask Pastor John", feedUrl: "https://feed.desiringgod.org/ask-pastor-john", category: "faith", publisher: "Desiring God" },
  { title: "The Bible in a Year (Fr. Mike)", feedUrl: "https://feeds.fireside.fm/bibleinayear/rss", category: "faith", publisher: "Ascension" },
];
