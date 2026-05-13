import { HiddenTunesTrack } from "../types/music";

function cleanText(value: any, fallback = "Unknown") {
  if (!value || typeof value !== "string") return fallback;

  return value
    .replace(/\(Official Video\)/gi, "")
    .replace(/\[Official Video\]/gi, "")
    .replace(/\(Official Music Video\)/gi, "")
    .replace(/\[Official Music Video\]/gi, "")
    .replace(/\(Official Audio\)/gi, "")
    .replace(/\[Official Audio\]/gi, "")
    .replace(/\(Audio\)/gi, "")
    .replace(/\[Audio\]/gi, "")
    .replace(/\(Lyrics?\)/gi, "")
    .replace(/\[Lyrics?\]/gi, "")
    .replace(/\(Visualizer\)/gi, "")
    .replace(/\[Visualizer\]/gi, "")
    .replace(/\(Performance Video\)/gi, "")
    .replace(/\[Performance Video\]/gi, "")
    .replace(/\(Live\)/gi, "")
    .replace(/\[Live\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeId(value: any) {
  return String(value || Date.now())
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function guessArtistFromTitle(title: string, channelTitle?: string) {
  const cleanTitle = cleanText(title, "");

  if (cleanTitle.includes(" - ")) {
    return cleanText(cleanTitle.split(" - ")[0], channelTitle || "Unknown Artist");
  }

  if (channelTitle) {
    return cleanText(
      channelTitle
        .replace(/ - Topic/gi, "")
        .replace(/VEVO/gi, "")
        .replace(/Official/gi, "")
        .replace(/Records/gi, "")
        .replace(/Music/gi, ""),
      "Unknown Artist"
    );
  }

  return "Unknown Artist";
}

function guessSongTitle(title: string) {
  const cleanTitle = cleanText(title, "Untitled");

  if (cleanTitle.includes(" - ")) {
    return cleanText(cleanTitle.split(" - ").slice(1).join(" - "), cleanTitle);
  }

  return cleanTitle;
}

export function guessGenreFromText(text: string) {
  const value = String(text || "").toLowerCase();

  if (value.includes("afro") || value.includes("afrobeats")) return "Afrobeats";
  if (value.includes("amapiano")) return "Amapiano";
  if (value.includes("gospel") || value.includes("worship")) return "Gospel";
  if (value.includes("hip hop") || value.includes("rap")) return "Hip-Hop";
  if (value.includes("r&b") || value.includes("soul")) return "R&B";
  if (value.includes("reggae")) return "Reggae";
  if (value.includes("dancehall")) return "Dancehall";
  if (value.includes("pop")) return "Pop";
  if (value.includes("jazz")) return "Jazz";
  if (value.includes("country")) return "Country";

  return "Mixed";
}

export function guessMoodFromText(text: string) {
  const value = String(text || "").toLowerCase();

  if (value.includes("love") || value.includes("romance")) return "Romantic";
  if (value.includes("sad") || value.includes("lonely") || value.includes("pain")) {
    return "Emotional";
  }
  if (value.includes("party") || value.includes("dance") || value.includes("club")) {
    return "Energetic";
  }
  if (value.includes("pray") || value.includes("god") || value.includes("worship")) {
    return "Spiritual";
  }
  if (value.includes("toxic") || value.includes("betray") || value.includes("cheat")) {
    return "Dark";
  }
  if (value.includes("chill") || value.includes("smooth")) return "Smooth";

  return "Vibe";
}

function enrichTrack(track: HiddenTunesTrack): HiddenTunesTrack {
  const searchText = `${track.title} ${track.artist} ${track.album || ""}`;

  return {
    ...track,
    genre: (track as any).genre || guessGenreFromText(searchText),
    mood: (track as any).mood || guessMoodFromText(searchText),
  } as HiddenTunesTrack;
}

export function normalizeYouTubeTrack(item: any): HiddenTunesTrack {
  const videoId = item.videoId || item.id || item.video_id;

  const rawTitle = item.title || "Untitled";
  const channelTitle = item.channelTitle || item.artist || "YouTube";

  const title = guessSongTitle(rawTitle);
  const artist = guessArtistFromTitle(rawTitle, channelTitle);

  const artwork =
    item.thumbnail ||
    item.artwork ||
    item.image ||
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  return enrichTrack({
    id: `youtube-${safeId(videoId || `${artist}-${title}`)}`,
    title,
    artist,
    album: item.album || undefined,
    artwork,
    thumbnail: artwork,
    duration: item.duration || undefined,

    source: "youtube",
    type: "song",

    videoId,
    channelTitle,
    isOnline: true,
  } as HiddenTunesTrack);
}

export function normalizeAudiusTrack(item: any): HiddenTunesTrack {
  const artwork =
    item.artwork?.["1000x1000"] ||
    item.artwork?.["480x480"] ||
    item.artwork?.["150x150"] ||
    item.artwork ||
    item.thumbnail ||
    "";

  return enrichTrack({
    id: `audius-${safeId(item.id || item.title)}`,
    title: cleanText(item.title, "Untitled"),
    artist: cleanText(item.user?.name || item.artist, "Unknown Artist"),
    album: item.album || undefined,
    artwork,
    thumbnail: artwork,
    duration: item.duration ? String(item.duration) : undefined,

    source: "audius",
    type: "song",

    streamUrl: item.streamUrl || item.url,
    url: item.streamUrl || item.url,
    isOnline: true,
  } as HiddenTunesTrack);
}

export function normalizeArchiveTrack(item: any): HiddenTunesTrack {
  const artwork = item.artwork || item.thumbnail || item.image || "";

  return enrichTrack({
    id: `archive-${safeId(item.id || item.identifier || item.title)}`,
    title: cleanText(item.title, "Untitled"),
    artist: cleanText(item.artist || item.creator, "Unknown Artist"),
    album: item.album || item.collection || undefined,
    artwork,
    thumbnail: artwork,
    duration: item.duration || undefined,

    source: "archive",
    type: "song",

    streamUrl: item.streamUrl || item.url,
    url: item.streamUrl || item.url,
    isOnline: true,
  } as HiddenTunesTrack);
}

export function normalizeAnyTrack(item: any): HiddenTunesTrack {
  if (!item) {
    return enrichTrack({
      id: `track-${Date.now()}`,
      title: "Untitled",
      artist: "Unknown Artist",
      artwork: "",
      thumbnail: "",
      source: "local",
      type: "song",
      isOnline: false,
    } as HiddenTunesTrack);
  }

  if (item.source === "youtube" || item.type === "youtube" || item.videoId) {
    return normalizeYouTubeTrack(item);
  }

  if (item.source === "audius") {
    return normalizeAudiusTrack(item);
  }

  if (item.source === "archive") {
    return normalizeArchiveTrack(item);
  }

  const artwork = item.artwork || item.thumbnail || item.cover || "";

  return enrichTrack({
    ...item,
    id: String(item.id || safeId(`${item.artist}-${item.title}`)),
    title: cleanText(item.title, "Untitled"),
    artist: cleanText(item.artist, "Unknown Artist"),
    album: item.album || undefined,
    artwork,
    thumbnail: item.thumbnail || item.artwork || artwork,
    duration: item.duration || undefined,

    source: item.source || "local",
    type: item.type || "song",

    streamUrl: item.streamUrl || item.url,
    url: item.url || item.streamUrl,
    isOnline: Boolean(item.isOnline || item.url || item.streamUrl),
  } as HiddenTunesTrack);
}

export function normalizeManyTracks(items: any[] = []): HiddenTunesTrack[] {
  return items.map(normalizeAnyTrack);
}

export function makeRadioFingerprint(track: any) {
  const normalized = normalizeAnyTrack(track);

  return `${normalized.source}-${normalized.artist}-${normalized.title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}