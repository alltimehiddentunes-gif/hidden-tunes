export type HealthSignal = "present" | "partial" | "missing" | "optional";

export type ReleaseHealthCheck = {
  id: string;
  label: string;
  status: HealthSignal;
  detail: string;
};

export type ReleaseHealthSummary = {
  score: number;
  readinessLabel: string;
  checks: ReleaseHealthCheck[];
  trackCount: number;
  audioReadyCount: number;
  artworkReadyCount: number;
  plainLyricsReadyCount: number;
  syncedLyricsReadyCount: number;
  metadataReadyCount: number;
  uploaderPresent: boolean;
  reviewStatus: string | null;
};

export type ReleaseHealthSongInput = {
  id?: string;
  title?: unknown;
  genre?: unknown;
  mood?: unknown;
  audio_url?: unknown;
  url?: unknown;
  artwork_url?: unknown;
  cover_url?: unknown;
  has_lyrics?: unknown;
  lyrics_url?: unknown;
  lyrics_type?: unknown;
};

export type ReleaseHealthLyricsInput = {
  plain_lyrics?: unknown;
  synced_lrc?: unknown;
  word_sync_json?: unknown;
};

export type ReleaseHealthSyncedInput = {
  plain_lyrics?: unknown;
  lyrics_lrc?: unknown;
  lyrics_json?: unknown;
};

export type ReleaseHealthAlbumInput = {
  title?: unknown;
  artwork_url?: unknown;
  release_year?: unknown;
  uploaded_by_user_id?: unknown;
  review_status?: unknown;
  artist_id?: unknown;
  artist_name?: unknown;
};

function text(value: unknown) {
  return String(value || "").trim();
}

function hasAudio(song: ReleaseHealthSongInput) {
  return Boolean(text(song.audio_url) || text(song.url));
}

function hasArtwork(song: ReleaseHealthSongInput) {
  return Boolean(text(song.artwork_url) || text(song.cover_url));
}

function hasPlainLyrics(
  song: ReleaseHealthSongInput,
  lyrics?: ReleaseHealthLyricsInput | null,
  synced?: ReleaseHealthSyncedInput | null
) {
  if (text(lyrics?.plain_lyrics)) return true;
  if (text(synced?.plain_lyrics)) return true;

  const lyricsType = text(song.lyrics_type).toLowerCase();
  if (lyricsType === "plain") return true;

  if (Boolean(song.has_lyrics) && text(song.lyrics_url) && !hasSyncedLyrics(lyrics, synced)) {
    return true;
  }

  return false;
}

function hasSyncedLyrics(
  lyrics?: ReleaseHealthLyricsInput | null,
  synced?: ReleaseHealthSyncedInput | null
) {
  if (text(lyrics?.synced_lrc)) return true;
  if (text(synced?.lyrics_lrc)) return true;

  if (lyrics?.word_sync_json) {
    if (Array.isArray(lyrics.word_sync_json)) {
      return lyrics.word_sync_json.length > 0;
    }
    if (typeof lyrics.word_sync_json === "object") {
      return Object.keys(lyrics.word_sync_json as object).length > 0;
    }
  }

  if (synced?.lyrics_json) {
    if (Array.isArray(synced.lyrics_json)) {
      return synced.lyrics_json.length > 0;
    }
    if (typeof synced.lyrics_json === "object") {
      return Object.keys(synced.lyrics_json as object).length > 0;
    }
  }

  const lyricsType = text((lyrics as { lyrics_type?: unknown } | null)?.lyrics_type);
  return lyricsType === "synced" || lyricsType === "lrc";
}

function trackMetadataComplete(song: ReleaseHealthSongInput) {
  return Boolean(text(song.title) && text(song.genre));
}

function ratioSignal(ready: number, total: number): HealthSignal {
  if (total <= 0) return "missing";
  if (ready >= total) return "present";
  if (ready > 0) return "partial";
  return "missing";
}

function ratioDetail(label: string, ready: number, total: number) {
  if (total <= 0) return `No tracks to evaluate ${label.toLowerCase()}.`;
  return `${ready}/${total} tracks`;
}

function readinessLabel(score: number, trackCount: number) {
  if (trackCount <= 0) return "No tracks";
  if (score >= 100) return "Release ready";
  if (score >= 70) return "Nearly ready";
  if (score >= 40) return "Needs work";
  return "Incomplete";
}

export function buildReleaseHealthSummary(input: {
  album: ReleaseHealthAlbumInput;
  artistName?: string | null;
  songs: ReleaseHealthSongInput[];
  trackLyricsBySongId?: Map<string, ReleaseHealthLyricsInput>;
  syncedLyricsBySongId?: Map<string, ReleaseHealthSyncedInput>;
}): ReleaseHealthSummary {
  const songs = input.songs || [];
  const trackCount = songs.length;
  const trackLyricsBySongId = input.trackLyricsBySongId || new Map();
  const syncedLyricsBySongId = input.syncedLyricsBySongId || new Map();

  const audioReadyCount = songs.filter(hasAudio).length;
  const artworkReadyCount = songs.filter(hasArtwork).length;

  const plainLyricsReadyCount = songs.filter((song) => {
    const songId = text(song.id);
    return hasPlainLyrics(
      song,
      trackLyricsBySongId.get(songId),
      syncedLyricsBySongId.get(songId)
    );
  }).length;

  const syncedLyricsReadyCount = songs.filter((song) => {
    const songId = text(song.id);
    return hasSyncedLyrics(
      trackLyricsBySongId.get(songId),
      syncedLyricsBySongId.get(songId)
    );
  }).length;

  const metadataReadyCount = songs.filter(trackMetadataComplete).length;

  const releaseArtworkPresent = Boolean(
    text(input.album.artwork_url) || artworkReadyCount > 0
  );
  const releaseTitlePresent = Boolean(text(input.album.title));
  const artistPresent = Boolean(
    text(input.album.artist_id) || text(input.artistName) || text(input.album.artist_name)
  );
  const releaseYearPresent = Boolean(text(input.album.release_year));
  const uploaderPresent = Boolean(text(input.album.uploaded_by_user_id));
  const reviewStatus = text(input.album.review_status) || null;

  const checks: ReleaseHealthCheck[] = [
    {
      id: "artwork",
      label: "Artwork",
      status: releaseArtworkPresent
        ? ratioSignal(artworkReadyCount, trackCount)
        : "missing",
      detail: text(input.album.artwork_url)
        ? "Release cover set"
        : ratioDetail("with artwork", artworkReadyCount, trackCount),
    },
    {
      id: "audio",
      label: "Audio",
      status: ratioSignal(audioReadyCount, trackCount),
      detail: ratioDetail("with audio", audioReadyCount, trackCount),
    },
    {
      id: "plain_lyrics",
      label: "Plain lyrics",
      status:
        trackCount === 0
          ? "optional"
          : ratioSignal(plainLyricsReadyCount, trackCount),
      detail: ratioDetail("with plain lyrics", plainLyricsReadyCount, trackCount),
    },
    {
      id: "synced_lyrics",
      label: "Synced lyrics",
      status:
        trackCount === 0
          ? "optional"
          : ratioSignal(syncedLyricsReadyCount, trackCount),
      detail: ratioDetail("with synced lyrics", syncedLyricsReadyCount, trackCount),
    },
    {
      id: "uploader",
      label: "Uploader",
      status: uploaderPresent ? "present" : "missing",
      detail: uploaderPresent ? "Owner linked" : "No uploader on file",
    },
    {
      id: "review",
      label: "Review status",
      status: reviewStatus ? "present" : "missing",
      detail: reviewStatus || "Not set",
    },
    {
      id: "metadata",
      label: "Metadata",
      status:
        releaseTitlePresent && artistPresent && metadataReadyCount === trackCount && trackCount > 0
          ? "present"
          : releaseTitlePresent && artistPresent
            ? ratioSignal(metadataReadyCount, trackCount)
            : "partial",
      detail:
        trackCount === 0
          ? "Missing title, artist, or tracks"
          : `${metadataReadyCount}/${trackCount} tracks with title + genre` +
            (releaseYearPresent ? " / year set" : ""),
    },
  ];

  const weightedChecks = [
    { weight: 24, ready: releaseArtworkPresent ? 1 : 0 },
    { weight: 24, ready: trackCount > 0 && audioReadyCount === trackCount ? 1 : 0 },
    { weight: 10, ready: trackCount > 0 && plainLyricsReadyCount === trackCount ? 1 : 0 },
    { weight: 10, ready: trackCount > 0 && syncedLyricsReadyCount === trackCount ? 1 : 0 },
    { weight: 8, ready: uploaderPresent ? 1 : 0 },
    { weight: 8, ready: reviewStatus ? 1 : 0 },
    {
      weight: 16,
      ready:
        releaseTitlePresent &&
        artistPresent &&
        trackCount > 0 &&
        metadataReadyCount === trackCount
          ? 1
          : 0,
    },
  ];

  const totalWeight = weightedChecks.reduce((sum, item) => sum + item.weight, 0);
  const earnedWeight = weightedChecks.reduce(
    (sum, item) => sum + item.weight * item.ready,
    0
  );
  const score =
    totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;

  return {
    score,
    readinessLabel: readinessLabel(score, trackCount),
    checks,
    trackCount,
    audioReadyCount,
    artworkReadyCount,
    plainLyricsReadyCount,
    syncedLyricsReadyCount,
    metadataReadyCount,
    uploaderPresent,
    reviewStatus,
  };
}

export function buildTrackHealth(input: {
  song: ReleaseHealthSongInput;
  lyrics?: ReleaseHealthLyricsInput | null;
  synced?: ReleaseHealthSyncedInput | null;
}) {
  return {
    hasAudio: hasAudio(input.song),
    hasArtwork: hasArtwork(input.song),
    hasPlainLyrics: hasPlainLyrics(input.song, input.lyrics, input.synced),
    hasSyncedLyrics: hasSyncedLyrics(input.lyrics, input.synced),
    metadataComplete: trackMetadataComplete(input.song),
  };
}

export async function loadLyricsHealthMaps(songIds: string[]) {
  const uniqueIds = Array.from(new Set(songIds.map((id) => text(id)).filter(Boolean)));

  const trackLyricsBySongId = new Map<string, ReleaseHealthLyricsInput>();
  const syncedLyricsBySongId = new Map<string, ReleaseHealthSyncedInput>();

  if (uniqueIds.length === 0) {
    return { trackLyricsBySongId, syncedLyricsBySongId };
  }

  const [trackLyricsResult, syncedLyricsResult] = await Promise.all([
    supabaseAdminSafeTrackLyrics(uniqueIds),
    supabaseAdminSafeSyncedLyrics(uniqueIds),
  ]);

  trackLyricsResult.forEach((row) => {
    const songId = text(row.song_id);
    if (songId) trackLyricsBySongId.set(songId, row);
  });

  syncedLyricsResult.forEach((row) => {
    const songId = text(row.song_id);
    if (songId) syncedLyricsBySongId.set(songId, row);
  });

  return { trackLyricsBySongId, syncedLyricsBySongId };
}

type LyricsRow = ReleaseHealthLyricsInput & { song_id?: string };
type SyncedRow = ReleaseHealthSyncedInput & { song_id?: string };

async function supabaseAdminSafeTrackLyrics(songIds: string[]) {
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const { isMissingSchemaColumnError } = await import("@/lib/supabaseErrors");

  const fullSelect =
    "song_id, plain_lyrics, synced_lrc, word_sync_json, lyrics_type";
  const coreSelect = "song_id, plain_lyrics, synced_lrc, word_sync_json";

  const { data, error } = await supabaseAdmin
    .from("track_lyrics")
    .select(fullSelect)
    .in("song_id", songIds);

  if (!error) {
    return (data || []) as LyricsRow[];
  }

  if (isMissingSchemaColumnError(error)) {
    const fallback = await supabaseAdmin
      .from("track_lyrics")
      .select(coreSelect)
      .in("song_id", songIds);

    if (fallback.error) {
      if (isMissingSchemaColumnError(fallback.error)) {
        return [] as LyricsRow[];
      }
      throw fallback.error;
    }

    return (fallback.data || []) as LyricsRow[];
  }

  if (
    String(error.message || "")
      .toLowerCase()
      .includes("track_lyrics")
  ) {
    return [] as LyricsRow[];
  }

  throw error;
}

async function supabaseAdminSafeSyncedLyrics(songIds: string[]) {
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const { data, error } = await supabaseAdmin
    .from("synced_lyrics")
    .select("song_id, plain_lyrics, lyrics_lrc, lyrics_json")
    .in("song_id", songIds);

  if (error) {
    if (String(error.message || "").toLowerCase().includes("synced_lyrics")) {
      return [] as SyncedRow[];
    }
    throw error;
  }

  return (data || []) as SyncedRow[];
}
