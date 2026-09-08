/** Offline adapter behavior tests. No network, storage files, builds or native runtime. */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const assert = require("node:assert/strict");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
let mode = "legacy", ios = true, mature = false, delivery = "direct";
const blocked = new Set(), known = new Set(), calls = [], requests = [];
const storage = new Map();
const policy = {
  get IOS_OPERATIONAL_PLATFORM() { return ios; },
  refreshIosOperationalPolicy: async () => ({ status: mode, revision: 3 }),
  getIosOperationalPolicySnapshot: () => ({ status: mode, revision: 3 }),
  iosOperationalSectionEnabled: () => mode !== "unavailable",
  iosOperationalMatureAccess: async () => ({ matureEnabled: mature }),
  isIosOperationalItemVisible: (ref) => mode === "legacy" || known.has(`${ref.type}:${ref.id}`) && !blocked.has(ref.id),
  filterIosOperationalItems: async (items, mapper, access) => {
    calls.push({ filter: items.map(mapper), access });
    if (!ios || mode === "legacy") return items;
    return items.filter((item) => {
      const ref = mapper(item);
      if (!ref || blocked.has(ref.id) || mode === "unavailable") return false;
      known.add(`${ref.type}:${ref.id}`);
      return true;
    });
  },
  resolveIosOperationalPlayback: async (ref, access) => {
    calls.push({ play: ref, access });
    if (!ios || mode === "legacy") return { enforced: false };
    if (mode !== "active" || !ref || blocked.has(ref.id)) throw new Error("denied");
    return { enforced: true, playbackUrl: `https://authorized.invalid/${ref.type}/${ref.id}`, revision: 3, delivery };
  },
  IosOperationalUnavailableError: class extends Error { constructor() { super("unavailable"); } },
};
const pagination = { page: 1, limit: 40, total: 800, totalPages: 20, hasMore: true };
const books = [
  { id: "book-ok", title: "Book", chapter_count: 2, is_mature: false },
  { id: "book-no", title: "Hidden book", chapter_count: 1, is_mature: false },
];
const chapters = [
  { id: "chapter-ok", audiobook_id: "book-ok", title: "One", chapter_number: 1, audio_url: "https://legacy.invalid/one.mp3", file: { id: "file-ok", audiobook_id: "book-ok", audio_url: "https://legacy.invalid/one.mp3" } },
  { id: "chapter-no", audiobook_id: "book-ok", title: "Two", chapter_number: 2, audio_url: "https://legacy.invalid/two.mp3" },
];
function bodyFor(url) {
  const parsed = new URL(url);
  const route = parsed.pathname;
  requests.push(route);
  if (route.includes("/api/tv/videos")) {
    if (route.endsWith("/play")) return { id: "tv-ok", source_type: "hls", source_id: "tv-ok", stream_url: "https://legacy.invalid/tv.m3u8" };
    return { success: true, videos: ["tv-ok", "tv-no"].map((id) => ({ id, title: "TV", categories: [], source_type: "hls", verified: true, public: true, playable: true })), pagination };
  }
  if (route.includes("/api/audiobooks")) {
    if (route.endsWith("/chapters/play")) return { audiobook_id: "book-ok", audiobook: books[0], from_chapter_id: "chapter-ok", start_index: 0, chapters };
    if (route.endsWith("/play")) return { audiobook_id: "book-ok", title: "Book", audio_url: "https://legacy.invalid/book.mp3", file: { id: "file-ok", audiobook_id: "book-ok", audio_url: "https://legacy.invalid/book.mp3" } };
    if (route.endsWith("/book-ok")) return { audiobook: books[0], chapters };
    return { audiobooks: books, pagination };
  }
  if (route.includes("/api/lectures")) {
    if (route.endsWith("/play")) return { programId: "lecture-ok", sessionId: "lesson-ok", mediaType: "audio", playableUrl: "https://legacy.invalid/lesson.mp3" };
    const lecture = { id: "lecture-ok", slug: "lecture-ok", title: "Lecture", is_mature: false };
    if (route.includes("/items/")) return { lecture, lessons: [{ id: "lesson-ok", item_id: "lecture-ok", title: "One" }, { id: "lesson-no", item_id: "lecture-ok", title: "Two" }], pagination };
    return { lectures: [lecture, { ...lecture, id: "lecture-no" }], pagination };
  }
  if (route.includes("/api/podcasts")) {
    if (route.endsWith("/play")) return { episode_id: "episode-ok", show_id: "show-ok", title: "Episode", audio_url: "https://legacy.invalid/episode.mp3" };
    const shows = ["show-ok", "show-no"].map((id) => ({ id, title: "Show", slug: id }));
    if (route.endsWith("/show-ok")) return { show: shows[0] };
    if (route.includes("/episodes")) return { episodes: ["episode-ok", "episode-no"].map((id) => ({ id, show_id: "show-ok", title: "Episode" })), pagination };
    return { success: true, shows, pagination };
  }
  if (route.includes("/api/motivation")) {
    const items = [{ id: "motivation-ok", title: "Talk", program_id: "program-a", media_type: "audio" }, { id: "motivation-no", title: "Hidden talk", program_id: "program-b" }];
    if (route.endsWith("/play")) return { item: items[0], playback: { url: "https://legacy.invalid/talk.mp3" } };
    if (route.includes("/programs/")) return { program: { id: "program-c", title: "Program" }, items: [{ ...items[0], id: "program-c-child", program_id: "program-c" }], pagination: { ...pagination, hasMore: false } };
    if (route === "/api/motivation") return { featured_items: items, featured_programs: [{ id: "program-a", title: "A" }, { id: "program-c", title: "C" }], recommended: [], popular: [], new_releases: [], continue_listening: items, recently_played: items, categories: [{ id: "cat", slug: "cat", name: "Cat", item_count: 300 }] };
    return { items, pagination };
  }
  throw new Error(`Unexpected mocked route ${route}`);
}

Module._resolveFilename = function (id, parent, ...args) {
  return originalResolve.call(this, id.startsWith("@/") ? path.join(root, id.slice(2)) : id, parent, ...args);
};
Module._load = function (id, parent, ...args) {
  if (id === "./iosOperationalPolicy") return policy;
  if (id === "react-native") return { Platform: { OS: "ios" }, Image: { resolveAssetSource: () => ({ uri: "fixture-logo" }) } };
  if (id === "@react-native-async-storage/async-storage") return { getItem: async (key) => storage.get(key) || null, setItem: async (key, value) => storage.set(key, value) };
  if (id.endsWith("catalogJsonFetch")) return { catalogJsonFetch: async (url) => ({ response: { ok: true, status: 200 }, json: bodyFor(url) }), isCatalogAbortError: () => false, isCatalogTimeoutError: () => false };
  if (id.endsWith("archiveVideoDiscovery")) return { fetchArchiveConcertVideos: async () => [] };
  if (id.endsWith("videoNormalizer")) return { normalizeVideoItem: (item) => item, getVideoDisplayCreator: () => "" };
  if (id.endsWith("tvCatalogQuality")) return { filterPublicTvCatalogVideos: (items) => items };
  return originalLoad.call(this, id, parent, ...args);
};
Module._extensions[".png"] = (mod) => { mod.exports = 1; };
Module._extensions[".ts"] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
  fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
global.__DEV__ = false;
global.fetch = async (url) => ({ ok: true, status: 200, json: async () => bodyFor(url) });

async function main() {
  const booksApi = require("../services/audiobooksApi.ts");
  const lectures = require("../services/lecturesCatalogApi.ts");
  const podcasts = require("../services/podcastCatalogApi.ts");
  const motivation = require("../services/motivationCatalogApi.ts");
  const tv = require("../services/tvCatalogApi.ts");
  let page = await booksApi.fetchAudiobooksBrowse();
  assert.equal(page.items.length, 2);
  assert.equal(page.pagination.total, 800);
  assert.equal(booksApi.peekCachedAudiobookPage("all", "", 1, 40).pagination.total, 800);
  ios = false; calls.length = 0;
  await lectures.fetchEducationalSessionPlayback("lecture-ok", "lesson-ok");
  await booksApi.fetchAudiobookPlay("book-ok");
  await podcasts.fetchPodcastEpisodePlay("episode-ok");
  await motivation.fetchMotivationItemPlayback("motivation-ok");
  await tv.fetchTvPlayback({ id: "tv-ok", title: "TV", categories: [], source_type: "hls" });
  assert.equal(calls.length, 0, "Android playback does not consult iOS policy in any of the five adapters");
  ios = true;
  const video = { id: "tv-ok", title: "TV", categories: [], source_type: "youtube_video", source_id: "stale-youtube-id" };
  await tv.fetchTvPlayback(video); // Seed the legacy URL cache before activation.
  mode = "active";
  for (const id of ["book-no", "chapter-no", "lecture-no", "lesson-no", "show-no", "episode-no", "motivation-no", "tv-no"]) blocked.add(id);
  page = await booksApi.fetchAudiobooksBrowse();
  assert.deepEqual(page.items.map((item) => item.id), ["book-ok"]);
  assert.equal(page.pagination.hasMore, true, "Filtering cannot terminate the original pagination cursor");
  assert.equal(page.pagination.total, 1);
  assert.deepEqual(booksApi.peekCachedAudiobookPage("all", "", 1, 40).items.map((item) => item.id), ["book-ok"]);
  let detail = await booksApi.fetchAudiobookDetail("book-ok");
  assert.deepEqual(detail.chapters.map((item) => item.id), ["chapter-ok"]);
  let play = await booksApi.fetchAudiobookPlay("book-ok");
  assert.equal(play.audio_url, "https://authorized.invalid/audiobook/book-ok");
  assert.equal(play.file.audio_url, play.audio_url);
  await assert.rejects(() => booksApi.fetchAudiobookChapterQueuePlay("book-ok", "chapter-ok"));
  blocked.delete("chapter-no");
  const queue = await booksApi.fetchAudiobookChapterQueuePlay("book-ok", "chapter-ok");
  assert.equal(queue.chapters.length, 2, "Authorization preserves queue membership");
  assert(queue.chapters.every((chapter) => chapter.audio_url.startsWith("https://authorized.invalid/")));
  const lecturesPage = await lectures.fetchEducationalCategoryPage("cat");
  assert.equal(lecturesPage.items.length, 1);
  assert.equal(lecturesPage.programs.length, 1);
  assert.equal(lecturesPage.pagination.hasMore, true);
  detail = await lectures.fetchEducationalProgramDetail("lecture-ok");
  assert.deepEqual(detail.sessions.map((item) => item.id), ["lesson-ok"]);
  play = await lectures.fetchEducationalSessionPlayback("lecture-ok", "lesson-ok");
  assert.equal(play.playableUrl, "https://authorized.invalid/lecture/lecture-ok");
  assert(calls.some((call) => call.play?.type === "lecture" && call.access?.assetId === "lesson-ok"), "Lecture playback binds parent and child");
  const podcastPage = await podcasts.fetchPodcastShows();
  assert.deepEqual(podcastPage.shows.map((show) => show.id), ["show-ok"]);
  assert.equal(podcastPage.pagination.hasMore, true);
  const episodes = await podcasts.fetchPodcastEpisodesByShow("show-ok");
  assert.deepEqual(episodes.episodes.map((episode) => episode.id), ["episode-ok"]);
  play = await podcasts.fetchPodcastEpisodePlay("episode-ok", { includeMature: true });
  assert.equal(play.play.audioUrl, "https://authorized.invalid/podcast_episode/episode-ok");
  assert(calls.some((call) => call.play?.type === "podcast_episode" && call.access?.matureEnabled === false), "A caller option does not bypass the existing mature setting");
  const home = await motivation.fetchMotivationHome();
  assert.deepEqual(home.featured_items.map((item) => item.id), ["motivation-ok"]);
  assert.deepEqual(home.featured_programs.map((program) => program.id), ["program-a", "program-c"], "Program cards use existing allowed members, including the bounded detail fallback");
  assert.equal("item_count" in home.categories[0], false);
  play = await motivation.fetchMotivationItemPlayback("motivation-ok");
  assert.equal(play.playableUrl, "https://authorized.invalid/motivational/motivation-ok");
  const tvPage = await tv.fetchTvCatalog();
  assert.deepEqual(tvPage.videos.map((item) => item.id), ["tv-ok"]);
  play = await tv.fetchTvPlayback(video);
  assert.equal(play.stream_url, "https://authorized.invalid/tv/tv-ok", "Active playback never reuses the seeded legacy URL");
  assert.equal(play.source_type, "official_stream", "Direct authorization cannot retain a cached YouTube delivery type");
  assert.equal(play.source_id, video.id, "Direct authorization cannot retain a cached YouTube source ID");
  delivery = "embed";
  play = await tv.fetchTvPlayback(video);
  assert.equal(play.stream_url, "");
  assert.equal(play.embed_url, "https://authorized.invalid/tv/tv-ok", "Embed authorization preserves the existing TV embed field");
  assert.equal(play.source_id, video.id, "Embedded delivery cannot reuse an unrelated cached source ID");
  delivery = "direct";
  blocked.add("tv-ok");
  assert.equal(await tv.fetchTvPlayback(video), null);
  blocked.add("book-ok");
  await assert.rejects(() => booksApi.fetchAudiobookDetail("book-ok"));
  assert.equal((await booksApi.fetchAudiobooksBrowse()).items.length, 0);
  blocked.add("show-ok");
  assert.equal((await podcasts.fetchPodcastShowById("show-ok")).show, null);
  blocked.add("lecture-ok");
  await assert.rejects(() => lectures.fetchEducationalProgramDetail("lecture-ok"));
  blocked.add("episode-ok");
  assert.equal((await podcasts.fetchPodcastEpisodePlay("episode-ok")).play, null);
  blocked.add("motivation-ok");
  await assert.rejects(() => motivation.fetchMotivationItemPlayback("motivation-ok"));
  mode = "unavailable";
  assert.equal((await podcasts.fetchPodcastShows()).shows.length, 0);
  console.log("PASS five iOS catalog adapters: offline legacy/Android, cached and fresh filtering, parent/child binding, mature access, revocation, pagination, program fallback, authorized playback URLs");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
