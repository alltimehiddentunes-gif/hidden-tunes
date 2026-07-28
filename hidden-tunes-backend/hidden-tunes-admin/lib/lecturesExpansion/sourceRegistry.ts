export type LectureExpansionWave = 1 | 2 | 3 | 4 | 5;

export type LectureSourceDefinition = {
  source_key: string;
  source_name: string;
  source_type: string;
  wave: LectureExpansionWave;
  region: string;
  languages: string[];
  media_types: Array<"audio" | "video">;
  base_url: string;
  api_url?: string;
  query_families: string[];
  collection_filter?: string;
  priority: number;
  requests_per_minute: number;
  max_concurrency: number;
  enabled: boolean;
};

export const COACHING_QUERY_FAMILIES = [
  "life coaching workshop",
  "career coaching training",
  "executive leadership coaching",
  "business coaching masterclass",
  "productivity coaching session",
  "confidence coaching exercises",
  "communication coaching skills",
  "public speaking coaching",
  "relationship coaching guidance",
  "parenting coaching lessons",
  "wellness coaching program",
  "health coaching education",
  "fitness coaching training",
  "financial coaching workshop",
  "study coaching techniques",
  "academic coaching sessions",
  "sports coaching fundamentals",
  "coach training certification",
  "coaching psychology lecture",
  "coaching ethics training",
];

export const WORLDWIDE_EDUCATIONAL_QUERY_FAMILIES = [
  "university lectures",
  "open courseware",
  "science lectures",
  "physics lectures",
  "mathematics lectures",
  "computer science lectures",
  "engineering lectures",
  "history lectures",
  "philosophy lectures",
  "economics lectures",
  "psychology lectures",
  "medicine lectures",
  "law lectures",
  "language lessons",
  "art history lectures",
  "music education",
  "environmental lectures",
  "archaeology lectures",
  "political science lectures",
  "data science lectures",
  "machine learning lectures",
  "cybersecurity training",
  "nursing education",
  "public health lectures",
  "geography lectures",
  "sociology lectures",
  "anthropology lectures",
  "literature lectures",
  "writing instruction",
  "journalism training",
  "architecture lectures",
  "agriculture education",
  "museum education",
  "teacher training",
  "research methods",
  "vocational training",
  "conference talks education",
  "seminar recordings",
  "tutorial lessons",
  "instructional films",
  "calculus lectures",
  "linear algebra lectures",
  "statistics lectures",
  "organic chemistry lectures",
  "molecular biology lectures",
  "quantum physics lectures",
  "astronomy lectures",
  "climate science lectures",
  "civil engineering lectures",
  "electrical engineering lectures",
  "mechanical engineering lectures",
  "algorithms lectures",
  "operating systems lectures",
  "database systems lectures",
  "software engineering lectures",
  "artificial intelligence lectures",
  "macroeconomics lectures",
  "microeconomics lectures",
  "constitutional law lectures",
  "international law lectures",
  "cognitive psychology lectures",
  "world history lectures",
  "ancient history lectures",
  "music theory lessons",
  "photography education",
  "graphic design education",
  "Spanish language lessons",
  "French language lessons",
  "German language lessons",
  "Mandarin Chinese lessons",
  "Japanese language lessons",
  "Arabic language lessons",
  "NASA educational films",
  "Smithsonian education",
  "Library of Congress lectures",
  "UNESCO education",
  "public health education",
  "open university lectures",
];

export const BROAD_EDUCATIONAL_SHARD_FAMILIES = [
  ..."0123456789abcdefghijklmnopqrstuvwxyz".split("").map((shard) => `broad educational sweep#${shard}`),
];

export const LECTURE_SOURCE_REGISTRY: LectureSourceDefinition[] = [
  {
    source_key: "internet_archive_broad_sweep",
    source_name: "Internet Archive Broad Educational Sweep",
    source_type: "internet_archive",
    wave: 1,
    region: "global",
    languages: ["en", "es", "fr", "de", "pt", "it", "zh", "ja", "multi"],
    media_types: ["audio", "video"],
    base_url: "https://archive.org",
    api_url: "https://archive.org/advancedsearch.php",
    // Archive caps deep pagination near ~10k rows/query — shard by identifier prefix.
    query_families: BROAD_EDUCATIONAL_SHARD_FAMILIES,
    priority: 5,
    requests_per_minute: 40,
    max_concurrency: 4,
    enabled: true,
  },
  {
    source_key: "internet_archive_public_domain",
    source_name: "Internet Archive Public Domain Education",
    source_type: "internet_archive",
    wave: 1,
    region: "global",
    languages: ["en", "es", "fr", "de", "pt", "it", "multi"],
    media_types: ["audio", "video"],
    base_url: "https://archive.org",
    api_url: "https://archive.org/advancedsearch.php",
    query_families: WORLDWIDE_EDUCATIONAL_QUERY_FAMILIES,
    priority: 10,
    requests_per_minute: 30,
    max_concurrency: 3,
    enabled: true,
  },
  {
    source_key: "internet_archive_coaching",
    source_name: "Internet Archive Coaching Education",
    source_type: "internet_archive",
    wave: 1,
    region: "global",
    languages: ["en", "multi"],
    media_types: ["audio", "video"],
    base_url: "https://archive.org",
    api_url: "https://archive.org/advancedsearch.php",
    query_families: COACHING_QUERY_FAMILIES,
    priority: 15,
    requests_per_minute: 25,
    max_concurrency: 2,
    enabled: true,
  },
  {
    source_key: "internet_archive_mit_ocw",
    source_name: "Internet Archive MIT OpenCourseWare",
    source_type: "internet_archive",
    wave: 2,
    region: "north_america",
    languages: ["en"],
    media_types: ["audio", "video"],
    base_url: "https://archive.org",
    api_url: "https://archive.org/advancedsearch.php",
    query_families: ["MIT OpenCourseWare", "MIT lecture course"],
    collection_filter: "opensource_movies",
    priority: 20,
    requests_per_minute: 20,
    max_concurrency: 2,
    enabled: true,
  },
  {
    source_key: "internet_archive_europe_education",
    source_name: "Internet Archive European Education",
    source_type: "internet_archive",
    wave: 3,
    region: "europe",
    languages: ["en", "fr", "de", "es", "it"],
    media_types: ["audio", "video"],
    base_url: "https://archive.org",
    api_url: "https://archive.org/advancedsearch.php",
    query_families: [
      "European university lectures",
      "French educational lectures",
      "German educational lectures",
      "Spanish educational lectures",
      "European history lectures",
    ],
    priority: 30,
    requests_per_minute: 20,
    max_concurrency: 2,
    enabled: true,
  },
  {
    source_key: "internet_archive_asia_education",
    source_name: "Internet Archive Asia Education",
    source_type: "internet_archive",
    wave: 5,
    region: "asia",
    languages: ["en", "zh", "ja", "ko", "hi"],
    media_types: ["audio", "video"],
    base_url: "https://archive.org",
    api_url: "https://archive.org/advancedsearch.php",
    query_families: [
      "Asian university lectures",
      "Japanese educational lectures",
      "Chinese educational lectures",
      "Indian educational lectures",
      "Southeast Asia education",
    ],
    priority: 40,
    requests_per_minute: 20,
    max_concurrency: 2,
    enabled: true,
  },
  {
    source_key: "internet_archive_africa_education",
    source_name: "Internet Archive Africa Education",
    source_type: "internet_archive",
    wave: 5,
    region: "africa",
    languages: ["en", "fr", "ar", "sw"],
    media_types: ["audio", "video"],
    base_url: "https://archive.org",
    api_url: "https://archive.org/advancedsearch.php",
    query_families: [
      "African university lectures",
      "African history education",
      "African public health education",
    ],
    priority: 50,
    requests_per_minute: 15,
    max_concurrency: 2,
    enabled: true,
  },
  {
    source_key: "internet_archive_americas_education",
    source_name: "Internet Archive Americas Education",
    source_type: "internet_archive",
    wave: 5,
    region: "south_america",
    languages: ["en", "es", "pt"],
    media_types: ["audio", "video"],
    base_url: "https://archive.org",
    api_url: "https://archive.org/advancedsearch.php",
    query_families: [
      "Latin America university lectures",
      "Brazil educational lectures",
      "Caribbean educational lectures",
    ],
    priority: 55,
    requests_per_minute: 15,
    max_concurrency: 2,
    enabled: true,
  },
  {
    source_key: "internet_archive_oceania_education",
    source_name: "Internet Archive Oceania Education",
    source_type: "internet_archive",
    wave: 5,
    region: "oceania",
    languages: ["en"],
    media_types: ["audio", "video"],
    base_url: "https://archive.org",
    api_url: "https://archive.org/advancedsearch.php",
    query_families: ["Australian university lectures", "Pacific education lectures"],
    priority: 60,
    requests_per_minute: 15,
    max_concurrency: 2,
    enabled: true,
  },
];

export function listEnabledLectureSources(sourceKey?: string) {
  const enabled = LECTURE_SOURCE_REGISTRY.filter((entry) => entry.enabled);
  if (sourceKey) return enabled.filter((entry) => entry.source_key === sourceKey);
  return enabled;
}

export function getLectureSource(sourceKey: string) {
  return LECTURE_SOURCE_REGISTRY.find((entry) => entry.source_key === sourceKey) || null;
}

export function pickNextLectureSource(state: {
  exhausted_sources: string[];
  source_key?: string | null;
}) {
  if (state.source_key) {
    const forced = getLectureSource(state.source_key);
    if (forced && !state.exhausted_sources.includes(forced.source_key)) return forced;
  }
  const candidates = listEnabledLectureSources().filter(
    (entry) => !state.exhausted_sources.includes(entry.source_key)
  );
  return candidates.sort((a, b) => a.priority - b.priority)[0] || null;
}

export function flattenSourceQueryTasks(source: LectureSourceDefinition) {
  return source.query_families.map((queryFamily) => ({
    source_key: source.source_key,
    query_family: queryFamily,
    subject_family: queryFamily,
    region: source.region,
    wave: source.wave,
  }));
}
