/** Shared license filter for lawful Internet Archive redistributable audio. */
export const INTERNET_ARCHIVE_OPEN_LICENSE_FILTER =
  '(licenseurl:*creativecommons* OR licenseurl:*publicdomain* OR licenseurl:"http://creativecommons.org/publicdomain/mark/1.0/" OR licenseurl:"https://creativecommons.org/publicdomain/mark/1.0/" OR rights:"Public Domain" OR rights:"public domain" OR rights:"Public domain")';

export type InternetArchiveQueryDefinition = {
  sourceKey: string;
  family: string;
  sourceName: string;
  query: string;
  categorySlug: string;
  categories: string[];
  isMature: boolean;
  publisher: string;
  catalogLane: "general" | "mature";
};

function buildCollectionQuery(collection: string) {
  return [`collection:${collection}`, "mediatype:audio", INTERNET_ARCHIVE_OPEN_LICENSE_FILTER].join(
    " AND "
  );
}

function buildSubjectQuery(subjects: string[]) {
  const subjectClause = subjects
    .map((subject) => `subject:"${subject}"`)
    .join(" OR ");
  return [
    `(${subjectClause})`,
    "mediatype:audio",
    INTERNET_ARCHIVE_OPEN_LICENSE_FILTER,
  ].join(" AND ");
}

export const INTERNET_ARCHIVE_AUDIOBOOK_QUERIES: Record<
  string,
  InternetArchiveQueryDefinition
> = {
  librivoxaudio: {
    sourceKey: "internet_archive:librivoxaudio",
    family: "librivoxaudio",
    sourceName: "Internet Archive LibriVox Audio",
    query: buildCollectionQuery("librivoxaudio"),
    categorySlug: "classics",
    categories: ["classics", "fiction"],
    isMature: false,
    publisher: "Internet Archive / LibriVox",
    catalogLane: "general",
  },
  opensource_audio: {
    sourceKey: "internet_archive:opensource_audio",
    family: "opensource_audio",
    sourceName: "Internet Archive Open Source Audio",
    query: [
      buildCollectionQuery("opensource_audio"),
      '(subject:audiobook OR subject:"audio book" OR subject:audiobooks OR subject:literature OR subject:poetry OR subject:lecture)',
    ].join(" AND "),
    categorySlug: "non-fiction",
    categories: ["non-fiction", "education"],
    isMature: false,
    publisher: "Internet Archive",
    catalogLane: "general",
  },
  audio_bookspoetry: {
    sourceKey: "internet_archive:audio_bookspoetry",
    family: "audio_bookspoetry",
    sourceName: "Internet Archive Books & Poetry Audio",
    query: buildCollectionQuery("audio_bookspoetry"),
    categorySlug: "poetry",
    categories: ["poetry", "classics"],
    isMature: false,
    publisher: "Internet Archive",
    catalogLane: "general",
  },
  community_audiobooks: {
    sourceKey: "internet_archive:community_audiobooks",
    family: "community_audiobooks",
    sourceName: "Internet Archive Community Audiobooks",
    query: buildSubjectQuery(["audiobook", "audio book", "audiobooks", "spoken word"]),
    categorySlug: "fiction",
    categories: ["fiction", "non-fiction"],
    isMature: false,
    publisher: "Internet Archive",
    catalogLane: "general",
  },
  educational_audiobooks: {
    sourceKey: "internet_archive:educational_audiobooks",
    family: "educational_audiobooks",
    sourceName: "Internet Archive Educational Audiobooks",
    query: buildSubjectQuery([
      "education",
      "lecture",
      "philosophy",
      "science",
      "history",
      "psychology",
      "economics",
      "technology",
    ]),
    categorySlug: "education",
    categories: ["education", "science", "history", "philosophy"],
    isMature: false,
    publisher: "Internet Archive",
    catalogLane: "general",
  },
  multilingual_literature: {
    sourceKey: "internet_archive:multilingual_literature",
    family: "multilingual_literature",
    sourceName: "Internet Archive Multilingual Literature Audio",
    query: [
      '(language:(Spanish OR French OR German OR Italian OR Portuguese OR Russian OR Chinese OR Japanese OR Arabic OR Hindi OR Dutch OR Polish OR Swedish OR Latin) OR language:spa OR language:fre OR language:ger OR language:ita OR language:por OR language:rus)',
      '(subject:audiobook OR subject:literature OR subject:poetry OR collection:librivoxaudio OR collection:audio_bookspoetry)',
      "mediatype:audio",
      INTERNET_ARCHIVE_OPEN_LICENSE_FILTER,
    ].join(" AND "),
    categorySlug: "fiction",
    categories: ["fiction", "classics", "language"],
    isMature: false,
    publisher: "Internet Archive",
    catalogLane: "general",
  },
  public_domain_classics: {
    sourceKey: "internet_archive:public_domain_classics",
    family: "public_domain_classics",
    sourceName: "Internet Archive Public Domain Classics",
    query: buildSubjectQuery([
      "classic literature",
      "classics",
      "shakespeare",
      "dickens",
      "austen",
      "twain",
    ]),
    categorySlug: "classics",
    categories: ["classics", "fiction", "drama"],
    isMature: false,
    publisher: "Internet Archive",
    catalogLane: "general",
  },
  mature_erotica_pd: {
    sourceKey: "internet_archive:mature_erotica_pd",
    family: "mature_erotica_pd",
    sourceName: "Internet Archive Mature Erotica (PD/CC)",
    query: buildSubjectQuery([
      "erotica",
      "erotic literature",
      "erotic fiction",
      "adult fiction",
    ]),
    categorySlug: "mature",
    categories: ["mature", "fiction"],
    isMature: true,
    publisher: "Internet Archive",
    catalogLane: "mature",
  },
  mature_romance_adult: {
    sourceKey: "internet_archive:mature_romance_adult",
    family: "mature_romance_adult",
    sourceName: "Internet Archive Mature Romance (PD/CC)",
    query: [
      buildSubjectQuery(["erotic romance", "adult romance", "sensual fiction", "erotica"]),
      '(subject:romance OR subject:fiction OR subject:literature)',
    ].join(" AND "),
    categorySlug: "mature",
    categories: ["mature", "fiction"],
    isMature: true,
    publisher: "Internet Archive",
    catalogLane: "mature",
  },
  mature_horror_dark: {
    sourceKey: "internet_archive:mature_horror_dark",
    family: "mature_horror_dark",
    sourceName: "Internet Archive Mature Horror / Dark Fiction (PD/CC)",
    query: [
      buildSubjectQuery([
        "horror",
        "gothic fiction",
        "dark fantasy",
        "weird fiction",
        "supernatural fiction",
      ]),
      '(subject:adult OR subject:mature OR subject:erotica OR subject:uncensored OR subject:explicit OR description:(erotica OR "adult fiction" OR uncensored OR "18+"))',
    ].join(" AND "),
    categorySlug: "mature",
    categories: ["mature", "fiction"],
    isMature: true,
    publisher: "Internet Archive",
    catalogLane: "mature",
  },
  mature_literary_adult: {
    sourceKey: "internet_archive:mature_literary_adult",
    family: "mature_literary_adult",
    sourceName: "Internet Archive Mature Literary Fiction (PD/CC)",
    query: buildSubjectQuery([
      "erotica",
      "erotic literature",
      "Decameron",
      "Fanny Hill",
      "Memoirs of a Woman of Pleasure",
      "Venus in Furs",
      "adult literature",
    ]),
    categorySlug: "mature",
    categories: ["mature", "fiction", "classics"],
    isMature: true,
    publisher: "Internet Archive",
    catalogLane: "mature",
  },
  mature_adult_nonfiction: {
    sourceKey: "internet_archive:mature_adult_nonfiction",
    family: "mature_adult_nonfiction",
    sourceName: "Internet Archive Adult Non-Fiction (PD/CC)",
    query: buildSubjectQuery([
      "sexuality",
      "sex education",
      "human sexuality",
      "adult psychology",
      "relationships",
    ]),
    categorySlug: "mature",
    categories: ["mature", "non-fiction", "education"],
    isMature: true,
    publisher: "Internet Archive",
    catalogLane: "mature",
  },
};

export type InternetArchiveAudiobookQueryFamily =
  keyof typeof INTERNET_ARCHIVE_AUDIOBOOK_QUERIES;

export const INTERNET_ARCHIVE_GENERAL_FAMILIES = Object.values(
  INTERNET_ARCHIVE_AUDIOBOOK_QUERIES
)
  .filter((entry) => entry.catalogLane === "general")
  .map((entry) => entry.family);

export const INTERNET_ARCHIVE_MATURE_FAMILIES = Object.values(
  INTERNET_ARCHIVE_AUDIOBOOK_QUERIES
)
  .filter((entry) => entry.catalogLane === "mature")
  .map((entry) => entry.family);

export function resolveInternetArchiveQuery(
  familyOrSourceKey: string
): InternetArchiveQueryDefinition | null {
  if (INTERNET_ARCHIVE_AUDIOBOOK_QUERIES[familyOrSourceKey]) {
    return INTERNET_ARCHIVE_AUDIOBOOK_QUERIES[familyOrSourceKey];
  }
  const bySourceKey = Object.values(INTERNET_ARCHIVE_AUDIOBOOK_QUERIES).find(
    (entry) => entry.sourceKey === familyOrSourceKey
  );
  return bySourceKey || null;
}
