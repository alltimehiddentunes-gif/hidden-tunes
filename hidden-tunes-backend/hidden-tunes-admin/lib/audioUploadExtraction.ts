import { parseBlob } from "music-metadata-browser";

export interface AudioUploadExtractionResult {
  metadata: {
    title?: string;
    artist?: string;
    album?: string;
    albumArtist?: string;
    genre?: string;
    year?: number;
    trackNumber?: number;
    discNumber?: number;
    isrc?: string;
    composer?: string;
    copyright?: string;
    bpm?: number;
  };
  technical: {
    durationSeconds?: number;
    codec?: string;
    bitrate?: number;
    sampleRate?: number;
    channels?: number;
    mimeType: string;
    fileSize: number;
  };
  artwork?: {
    file: File;
    mimeType: string;
    width?: number;
    height?: number;
    source: "embedded";
  };
  lyrics?: {
    plainText?: string;
    syncedLrcText?: string;
    source:
      | "embedded-uslt"
      | "embedded-sylt"
      | "embedded-mp4"
      | "embedded-vorbis";
    synchronized: boolean;
    verified: false;
  };
  warnings: string[];
}

type NativeTag = { id?: unknown; value?: unknown };
type ParsedAudioMetadata = {
  common?: Record<string, unknown>;
  format?: Record<string, unknown>;
  native?: Record<string, NativeTag[]>;
  quality?: { warnings?: Array<{ message?: unknown }> };
};

type PictureValue = {
  data?: ArrayBuffer | ArrayBufferView;
  format?: unknown;
  type?: unknown;
};

const LOW_ARTWORK_EDGE = 500;

export function cleanAudioUploadFilename(value: string) {
  return String(value || "")
    .replace(/\.[^/.]+$/, "")
    .replace(/\s*(?:\(\d+\)|copy(?:\s+\d+)?|duplicate)\s*$/i, "")
    .replace(/^\d+\s*[.\-_ ]+\s*/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function firstText(value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = text(item);
      if (candidate) return candidate;
    }
    return undefined;
  }
  return text(value);
}

function pictureBytes(value: PictureValue["data"]) {
  if (!value) return null;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

export function detectArtworkMimeType(bytes: Uint8Array, declared?: string) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  const normalized = text(declared)?.toLowerCase();
  return normalized === "image/jpeg" || normalized === "image/png" || normalized === "image/webp"
    ? normalized
    : undefined;
}

async function readImageDimensions(file: File) {
  if (typeof createImageBitmap !== "function") return {};
  const bitmap = await createImageBitmap(file);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

function nativeTags(parsed: ParsedAudioMetadata) {
  return Object.entries(parsed.native || {}).flatMap(([tagType, tags]) =>
    (tags || []).map((tag) => ({ tagType, id: String(tag.id || ""), value: tag.value }))
  );
}

function lrcTime(timestamp: number) {
  const totalSeconds = Math.max(0, timestamp / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const centiseconds = Math.floor((totalSeconds - Math.floor(totalSeconds)) * 100);
  return `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(
    centiseconds
  ).padStart(2, "0")}]`;
}

function synchronizedLines(value: unknown) {
  const candidates = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? ((value as { syncText?: unknown; synchronizedLyrics?: unknown }).syncText ||
          (value as { synchronizedLyrics?: unknown }).synchronizedLyrics)
      : null;
  if (!Array.isArray(candidates)) return undefined;

  const lines = candidates.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const lyric = text(row.text ?? row.value ?? row.lyric);
    const timestamp = positiveNumber(row.timestamp ?? row.time ?? row.timeStamp);
    return lyric && timestamp !== undefined ? [`${lrcTime(timestamp)} ${lyric}`] : [];
  });
  return lines.length ? lines.join("\n") : undefined;
}

function plainLyricText(value: unknown) {
  if (typeof value === "string") return text(value);
  if (Array.isArray(value)) {
    const lines = value.flatMap((entry) => {
      if (typeof entry === "string") return text(entry) ? [entry.trim()] : [];
      if (!entry || typeof entry !== "object") return [];
      const lyric = text((entry as Record<string, unknown>).text);
      return lyric ? [lyric] : [];
    });
    return lines.length ? lines.join("\n") : undefined;
  }
  if (value && typeof value === "object") {
    return text((value as Record<string, unknown>).text);
  }
  return undefined;
}

function extractLyrics(parsed: ParsedAudioMetadata, warnings: string[]) {
  const tags = nativeTags(parsed);
  const sylt = tags.find((tag) => /^SYLT(?::|$)/i.test(tag.id));
  if (sylt) {
    const syncedLrcText = synchronizedLines(sylt.value);
    if (syncedLrcText) {
      return {
        syncedLrcText,
        source: "embedded-sylt" as const,
        synchronized: true,
        verified: false as const,
      };
    }
    const fallbackText = plainLyricText(sylt.value);
    warnings.push("Synchronized lyrics were detected, but this parser did not expose their timing.");
    if (fallbackText) {
      return {
        plainText: fallbackText,
        source: "embedded-sylt" as const,
        synchronized: false,
        verified: false as const,
      };
    }
  }

  const lyricTag = tags.find((tag) => /^(USLT|ULT)(:|$)/i.test(tag.id));
  if (lyricTag) {
    const plainText = plainLyricText(lyricTag.value);
    if (plainText) {
      return { plainText, source: "embedded-uslt" as const, synchronized: false, verified: false as const };
    }
  }

  const mp4Tag = tags.find((tag) => /^(©lyr|lyr|lyrics)$/i.test(tag.id) && /mp4|iTunes/i.test(tag.tagType));
  if (mp4Tag) {
    const plainText = plainLyricText(mp4Tag.value);
    if (plainText) {
      return { plainText, source: "embedded-mp4" as const, synchronized: false, verified: false as const };
    }
  }

  const vorbisTag = tags.find(
    (tag) => /^(lyrics|unsyncedlyrics)$/i.test(tag.id) && /vorbis|flac|ogg/i.test(tag.tagType)
  );
  if (vorbisTag) {
    const plainText = plainLyricText(vorbisTag.value);
    if (plainText) {
      return { plainText, source: "embedded-vorbis" as const, synchronized: false, verified: false as const };
    }
  }

  const commonLyrics = plainLyricText(parsed.common?.lyrics);
  return commonLyrics
    ? { plainText: commonLyrics, source: "embedded-uslt" as const, synchronized: false, verified: false as const }
    : undefined;
}

export async function normalizeParsedAudioMetadata(
  file: File,
  parsed: ParsedAudioMetadata
): Promise<AudioUploadExtractionResult> {
  const common = parsed.common || {};
  const format = parsed.format || {};
  const warnings = (parsed.quality?.warnings || []).flatMap((warning) =>
    text(warning.message) ? [String(warning.message).trim()] : []
  );

  const result: AudioUploadExtractionResult = {
    metadata: {
      title: text(common.title),
      artist: text(common.artist),
      album: text(common.album),
      albumArtist: text(common.albumartist),
      genre: firstText(common.genre),
      year: positiveNumber(common.year),
      trackNumber: positiveNumber((common.track as { no?: unknown } | undefined)?.no),
      discNumber: positiveNumber((common.disk as { no?: unknown } | undefined)?.no),
      isrc: firstText(common.isrc),
      composer: firstText(common.composer),
      copyright: text(common.copyright),
      bpm: positiveNumber(common.bpm),
    },
    technical: {
      durationSeconds: positiveNumber(format.duration),
      codec: text(format.codec ?? format.container),
      bitrate: positiveNumber(format.bitrate),
      sampleRate: positiveNumber(format.sampleRate),
      channels: positiveNumber(format.numberOfChannels),
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
    },
    lyrics: extractLyrics(parsed, warnings),
    warnings,
  };

  if (!result.technical.durationSeconds && !result.technical.codec && !text(format.container)) {
    warnings.push("No readable audio stream metadata was detected; the file may be corrupt or unsupported.");
  }

  const pictures = Array.isArray(common.picture) ? (common.picture as PictureValue[]) : [];
  const selected = pictures.find((picture) => /front/i.test(String(picture.type || ""))) || pictures[0];
  if (selected) {
    const bytes = pictureBytes(selected.data);
    const mimeType = bytes ? detectArtworkMimeType(bytes, text(selected.format)) : undefined;
    if (!bytes?.length || !mimeType) {
      warnings.push("Embedded artwork is corrupt or uses an unsupported image format.");
    } else {
      const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp";
      const artworkBuffer = new Uint8Array(bytes).buffer as ArrayBuffer;
      const artworkFile = new File([artworkBuffer], `embedded-cover.${extension}`, { type: mimeType });
      try {
        const dimensions = await readImageDimensions(artworkFile);
        result.artwork = { file: artworkFile, mimeType, ...dimensions, source: "embedded" };
        if (
          dimensions.width &&
          dimensions.height &&
          (dimensions.width < LOW_ARTWORK_EDGE || dimensions.height < LOW_ARTWORK_EDGE)
        ) {
          warnings.push(`Embedded artwork is low resolution (${dimensions.width} × ${dimensions.height}).`);
        }
      } catch {
        warnings.push("Embedded artwork could not be decoded.");
      }
    }
  }

  return result;
}

export async function extractAudioUploadData(file: File): Promise<AudioUploadExtractionResult> {
  const before = file.size;
  const parsed = (await parseBlob(file, {
    duration: true,
    skipCovers: false,
  })) as unknown as ParsedAudioMetadata;
  const result = await normalizeParsedAudioMetadata(file, parsed);
  if (file.size !== before) {
    throw new Error("Audio parser unexpectedly changed the source file.");
  }
  return result;
}
