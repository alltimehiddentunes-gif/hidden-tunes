import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatSourceCursor,
  loadPodcastSourceRegistry,
  updatePodcastSourceRegistryEntry,
  PODCAST_MATURE_ITUNES_QUERIES,
  PODCAST_EXPANSION_ITUNES_COUNTRIES,
} from "@/lib/podcastSourceRegistry";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const queryArg = process.argv.find((arg) => arg.startsWith("--query="))?.slice(8);
const countryArg = process.argv.find((arg) => arg.startsWith("--country="))?.slice(10);

const queryIndex =
  queryArg != null
    ? Number(queryArg)
    : Math.max(0, PODCAST_MATURE_ITUNES_QUERIES.indexOf("podcast erotico"));
const languageIndex =
  countryArg != null
    ? PODCAST_EXPANSION_ITUNES_COUNTRIES.findIndex(
        (code) => code.toUpperCase() === countryArg.toUpperCase()
      )
    : PODCAST_EXPANSION_ITUNES_COUNTRIES.indexOf("BR");

if (queryIndex < 0 || languageIndex < 0) {
  throw new Error(`Invalid jump target query=${queryIndex} country=${languageIndex}`);
}

const before = loadPodcastSourceRegistry(adminRoot).find(
  (entry) => entry.source_key === "itunes:mature"
);
const cursor = formatSourceCursor({
  queryIndex,
  languageIndex,
  offset: 0,
});

updatePodcastSourceRegistryEntry(
  "itunes:mature",
  { checkpoint_cursor: cursor },
  adminRoot
);

const after = loadPodcastSourceRegistry(adminRoot).find(
  (entry) => entry.source_key === "itunes:mature"
);

console.log(
  JSON.stringify(
    {
      before: before?.checkpoint_cursor,
      after: after?.checkpoint_cursor,
      query: PODCAST_MATURE_ITUNES_QUERIES[queryIndex],
      country: PODCAST_EXPANSION_ITUNES_COUNTRIES[languageIndex],
    },
    null,
    2
  )
);
