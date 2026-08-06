import type { AndroidAutoBrowseItem, AndroidAutoCatalogSnapshot, AndroidAutoTrackPayload } from "./androidAutoCatalogSync";
import { isAndroidAutoContentVisible } from "./androidAutoVisibility";
import { getPremiumMoodRooms, songMatchesMoodRoom } from "../utils/moodRooms";
import { WORLD_PRESETS } from "../utils/emotionalWorlds";

const MAX_TRACKS = 420;
const MAX_FOLDER_ITEMS = 24;
const DOMAIN_CAPS = { music: 230, radio: 60, podcast: 80, audiobook: 50 } as const;
const BASE_CONTEXT_CAPS: Record<string, number> = {
  recently_played: 16, favorites: 16, recently_added: 24,
  artist: 48, album: 40, genre: 20, playlist: 20,
};

function folder(mediaId: string, title: string, subtitle: string): AndroidAutoBrowseItem {
  return { mediaId, title, subtitle, playable: false };
}
function empty(parentId: string, title: string): AndroidAutoBrowseItem {
  return { mediaId: `empty:${parentId}`, title, subtitle: "", playable: false };
}
function section(parentId: string, items: AndroidAutoBrowseItem[], emptyTitle: string) {
  return { parentId, items: items.length ? items.slice(0, MAX_FOLDER_ITEMS) : [empty(parentId, emptyTitle)] };
}
function replaceSection(sections: AndroidAutoCatalogSnapshot["sections"], replacement: AndroidAutoCatalogSnapshot["sections"][number]) {
  const index = sections.findIndex((entry) => entry.parentId === replacement.parentId);
  if (index >= 0) sections[index] = replacement; else sections.push(replacement);
}
function contextualTrack(track: AndroidAutoTrackPayload, parentId: string) {
  return { ...track, mediaId: `${track.mediaId}:ctx:${encodeURIComponent(parentId)}`,
    parentId, canonicalId: track.canonicalId || track.id,
    collection: [track.collection, parentId.replace(/[:_-]+/g, " ")].filter(Boolean).join(" · ") };
}
function contextualSection(parentId: string, source: AndroidAutoTrackPayload[],
  addTrack: (track: AndroidAutoTrackPayload) => boolean, emptyTitle: string) {
  const items: AndroidAutoBrowseItem[] = [];
  for (const original of source) {
    const track = contextualTrack(original, parentId);
    const domain = String(track.contentType || "music") as "music" | "radio" | "podcast" | "audiobook";
    if (!isAndroidAutoContentVisible(track, domain)) continue;
    if (!addTrack(track)) continue;
    items.push({ mediaId: track.mediaId, title: track.title, subtitle: track.artist, playable: true,
      artworkUrl: track.artworkUrl, contentType: track.contentType, parentId });
  }
  return section(parentId, items, emptyTitle);
}

export function mergeAndroidAutoPremiumSnapshot(base: AndroidAutoCatalogSnapshot, premium: {
  premiumTracks: AndroidAutoTrackPayload[];
  premiumSections: AndroidAutoCatalogSnapshot["sections"];
}): AndroidAutoCatalogSnapshot {
  const baseContextCounts = new Map<string, number>();
  const tracks = base.tracks.filter((track) => {
    const parentId = String(track.parentId || "recently_added");
    const key = parentId.split(":", 1)[0];
    const cap = BASE_CONTEXT_CAPS[key] ?? 0;
    const count = baseContextCounts.get(key) || 0;
    if (count >= cap) return false;
    baseContextCounts.set(key, count + 1);
    return true;
  }).map((track) => ({ ...track }));
  const trackIds = new Set(tracks.map((track) => track.mediaId));
  const domainCounts = new Map<string, number>();
  for (const track of tracks) {
    const domain = String(track.contentType || "music");
    domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
  }
  const addTrack = (track: AndroidAutoTrackPayload) => {
    const domain = String(track.contentType || "music") as keyof typeof DOMAIN_CAPS;
    const cap = DOMAIN_CAPS[domain] || 0;
    if (tracks.length >= MAX_TRACKS || (domainCounts.get(domain) || 0) >= cap
      || trackIds.has(track.mediaId)) return false;
    tracks.push(track);
    trackIds.add(track.mediaId);
    domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
    return true;
  };
  // Never advertise a playable node that was trimmed from the bounded
  // registry. Browsable nodes remain available.
  const sections = base.sections.map((entry) => ({ ...entry, items: entry.items
    .filter((item) => !item.playable || trackIds.has(item.mediaId))
    .map((item) => ({ ...item })) }));
  const premiumByMediaId = new Map(premium.premiumTracks.map((track) => [track.mediaId, track]));
  for (const entry of premium.premiumSections) {
    const items: AndroidAutoBrowseItem[] = [];
    for (const item of entry.items) {
      if (!item.playable) { items.push(item); continue; }
      const original = premiumByMediaId.get(item.mediaId);
      if (!original) continue;
      const contextual = contextualTrack(original, entry.parentId);
      if (!trackIds.has(contextual.mediaId) && !addTrack(contextual)) continue;
      items.push({ ...item, mediaId: contextual.mediaId, parentId: entry.parentId });
    }
    replaceSection(sections, { parentId: entry.parentId, items: items.slice(0, MAX_FOLDER_ITEMS) });
  }
  const musicTracks = tracks.filter((track) => (track.contentType || "music") === "music" && track.url);
  const uniqueMusic = [...new Map(musicTracks.map((track) =>
    [String(track.canonicalId || track.id), track])).values()];
  replaceSection(sections, contextualSection("recommended", uniqueMusic.slice(0, 12), addTrack,
    "Recommendations will appear as you listen."));
  const moodFolders: AndroidAutoBrowseItem[] = [];
  for (const room of getPremiumMoodRooms().slice(0, 12)) {
    const parentId = `mood:${room.id}`;
    const matches = uniqueMusic.filter((track) => songMatchesMoodRoom({ title: track.title, artist: track.artist,
      album: track.album, mood: track.collection, genre: track.collection,
      tags: String(track.collection || "").split(" · ") }, room)).slice(0, 16);
    if (!matches.length) continue;
    moodFolders.push(folder(parentId, room.title, "Mood collection"));
    replaceSection(sections, contextualSection(parentId, matches, addTrack, "No matching audio is available."));
  }
  replaceSection(sections, section("moods", moodFolders, "Mood collections will appear here."));
  const worldFolders: AndroidAutoBrowseItem[] = [];
  for (const [worldId, preset] of Object.entries(WORLD_PRESETS).slice(0, 12)) {
    const parentId = `emotional-world:${worldId}`;
    const terms = preset.moodTags.map((term) => term.toLowerCase());
    const matches = uniqueMusic.filter((track) => {
      const hay = `${track.title} ${track.artist} ${track.album} ${track.collection || ""}`.toLowerCase();
      return terms.some((term) => hay.includes(term));
    }).slice(0, 16);
    if (!matches.length) continue;
    worldFolders.push(folder(parentId, worldId.replace(/_/g, " "), "Emotional World"));
    replaceSection(sections, contextualSection(parentId, matches, addTrack, "No matching audio is available."));
  }
  replaceSection(sections, section("emotional_worlds", worldFolders,
    "Emotional Worlds will appear as your catalogue grows."));
  replaceSection(sections, { parentId: "listen", items: [
    folder("continue_listening", "Continue Listening", "Resume unfinished audio"),
    folder("recently_played", "Recently Played", "Your recent listening"),
    folder("favorites", "Favorites", "Saved audio"),
    folder("recommended", "Recommended", "Listening suggestions"),
    folder("recommended_podcasts", "Recommended Podcasts", "Podcast suggestions"),
    folder("now_playing", "Now Playing", "Current playback"),
    folder("search", "Search", "Search all available audio"),
  ] });
  replaceSection(sections, { parentId: "radio", items: [
    folder("radio_favorites", "Favorite Stations", "Saved stations"), folder("radio_recent", "Recent Stations", "Recently played stations"),
    folder("radio_recommended", "Recommended Stations", "Listening suggestions"), folder("radio_browse", "Browse Stations", "Explore live radio"),
  ] });
  replaceSection(sections, { parentId: "library", items: [
    folder("artists", "Artists", "Browse by artist"), folder("albums", "Albums", "Browse by album"),
    folder("genres", "Genres", "Browse by genre"), folder("playlists", "Playlists", "Collections"),
    folder("podcasts", "Podcasts", "Shows and episodes"), folder("audiobooks", "Audiobooks", "Books and chapters"),
    folder("music", "Saved Music", "Your music"), folder("moods", "Moods", "Mood collections"),
    folder("emotional_worlds", "Emotional Worlds", "Emotion-aware collections"),
  ] });
  replaceSection(sections, section("search", sections.find((entry) => entry.parentId === "recently_played")?.items.filter((item) => item.playable) || [],
    "Use voice Search to find available audio."));
  const requiredEmptyStates: Record<string, string> = {
    continue_listening: "Continue listening on your phone to see unfinished audio here.",
    recently_played: "Your recent listening will appear here.",
    favorites: "Favorites will appear here.",
    recommended: "Recommendations will appear as you listen.",
    recommended_podcasts: "Podcast recommendations will appear as you listen.",
    now_playing: "Start playback to see the current item here.",
    radio_favorites: "Favorite stations will appear here.",
    radio_recent: "Your recent stations will appear here.",
    radio_recommended: "Station recommendations will appear as you listen.",
    radio_browse: "Browse groups will appear here.",
    artists: "Artists will appear here.", albums: "Albums will appear here.",
    genres: "Genres will appear here.", playlists: "Playlists will appear here.",
    podcasts: "Follow podcasts to find them here.",
    audiobooks: "Audiobooks in progress will appear here.",
    music: "Saved music will appear here.", moods: "Mood collections will appear here.",
    emotional_worlds: "Emotional Worlds will appear here.",
  };
  for (const [parentId, emptyTitle] of Object.entries(requiredEmptyStates)) {
    const existing = sections.find((entry) => entry.parentId === parentId);
    if (!existing || !existing.items.length) replaceSection(sections, section(parentId, [], emptyTitle));
  }
  const knownParents = new Set(sections.map((entry) => entry.parentId));
  for (const entry of sections) {
    entry.items = entry.items.filter((item) => item.playable
      || item.mediaId.startsWith("empty:") || knownParents.has(item.mediaId));
    if (!entry.items.length) {
      entry.items = [empty(entry.parentId, requiredEmptyStates[entry.parentId]
        || "No matching audio is available.")];
    }
  }
  return { ...base, roots: [folder("listen", "Listen", "Your listening"), folder("radio", "Radio", "Live stations"),
    folder("library", "Library", "Music, podcasts, and books")], sections, tracks: tracks.slice(0, MAX_TRACKS) };
}
