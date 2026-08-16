import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  cleanAudioUploadFilename,
  detectArtworkMimeType,
  extractAudioUploadData,
  normalizeParsedAudioMetadata,
} from "../lib/audioUploadExtraction";

async function main() {

function audioFile(name = "fixture.mp3", bytes = [0x49, 0x44, 0x33]) {
  return new File([new Uint8Array(bytes)], name, { type: "audio/mpeg" });
}

function jpegDimensions(bytes: Uint8Array) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8],
      };
    }
    if (length < 2) break;
    offset += length + 2;
  }
  return {};
}

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

assert.equal(cleanAudioUploadFilename("Low Light(1).mp3"), "Low Light");
assert.equal(cleanAudioUploadFilename("Low Light copy 2.mp3"), "Low Light");
assert.equal(cleanAudioUploadFilename("01 - Low_Light.mp3"), "Low Light");
assert.equal(cleanAudioUploadFilename("Low Light (Live).mp3"), "Low Light (Live)");
assert.equal(cleanAudioUploadFilename("Low Light (Remix).mp3"), "Low Light (Remix)");
assert.equal(detectArtworkMimeType(jpeg), "image/jpeg");
assert.equal(detectArtworkMimeType(png), "image/png");
assert.equal(detectArtworkMimeType(new Uint8Array([1, 2, 3])), undefined);

const original = audioFile("Tagged.mp3", [1, 2, 3, 4]);
const originalBytes = new Uint8Array(await original.arrayBuffer());
const tagged = await normalizeParsedAudioMetadata(original, {
  common: {
    title: "Embedded title",
    artist: "Embedded artist",
    album: "Embedded album",
    albumartist: "Album artist",
    genre: ["Soul"],
    year: 2026,
    track: { no: 2 },
    disk: { no: 1 },
    isrc: ["GB-HT-26-00001"],
    composer: ["Composer"],
    copyright: "Copyright holder",
    bpm: 92,
    picture: [{ data: jpeg, format: "image/png", type: "Cover (front)" }],
  },
  format: {
    duration: 245.4,
    codec: "MPEG 1 Layer 3",
    bitrate: 320000,
    sampleRate: 44100,
    numberOfChannels: 2,
  },
  native: {
    ID3v2: [{ id: "USLT:lyrics", value: { text: "Plain embedded lyrics" } }],
  },
});

assert.equal(tagged.metadata.title, "Embedded title");
assert.equal(tagged.metadata.artist, "Embedded artist");
assert.equal(tagged.metadata.album, "Embedded album");
assert.equal(tagged.metadata.isrc, "GB-HT-26-00001");
assert.equal(tagged.technical.durationSeconds, 245.4);
assert.equal(tagged.technical.bitrate, 320000);
assert.equal(tagged.technical.codec, "MPEG 1 Layer 3");
assert.equal(tagged.technical.sampleRate, 44100);
assert.equal(tagged.technical.channels, 2);
assert.equal(tagged.artwork?.mimeType, "image/jpeg", "magic bytes must override a wrong declared MIME");
assert.equal(tagged.lyrics?.plainText, "Plain embedded lyrics");
assert.equal(tagged.lyrics?.synchronized, false);
assert.deepEqual(new Uint8Array(await original.arrayBuffer()), originalBytes, "source bytes must remain unchanged");

const synchronized = await normalizeParsedAudioMetadata(audioFile(), {
  common: {},
  format: {},
  native: {
    ID3v2: [
      {
        id: "SYLT",
        value: {
          syncText: [
            { timestamp: 1000, text: "First" },
            { timestamp: 2500, text: "Second" },
          ],
        },
      },
    ],
  },
});
assert.equal(synchronized.lyrics?.syncedLrcText, "[00:01.00] First\n[00:02.50] Second");
assert.equal(synchronized.lyrics?.synchronized, true);

const malformedArtwork = await normalizeParsedAudioMetadata(audioFile(), {
  common: { picture: [{ data: new Uint8Array([1, 2, 3]), format: "image/gif" }] },
  format: {},
});
assert.equal(malformedArtwork.artwork, undefined);
assert(malformedArtwork.warnings.some((warning) => /artwork is corrupt/i.test(warning)));

const noArtwork = await normalizeParsedAudioMetadata(audioFile(), { common: {}, format: {} });
assert.equal(noArtwork.artwork, undefined);
assert.equal(noArtwork.lyrics, undefined);

const companionLrc = "[00:01.00] Companion";
const embeddedLrc = synchronized.lyrics?.syncedLrcText || "";
assert.equal(companionLrc || embeddedLrc, companionLrc, "companion LRC must override embedded lyrics");
const manualLyrics = "Manual lyrics";
assert.equal(manualLyrics ?? companionLrc ?? embeddedLrc, manualLyrics, "manual lyrics must override all detected lyrics");

const corrupt = await extractAudioUploadData(audioFile("corrupt.mp3", [1, 2, 3]));
assert(corrupt.warnings.some((warning) => /corrupt or unsupported/i.test(warning)));

const unreadable = audioFile("unreadable.mp3", [1, 2, 3]);
Object.defineProperty(unreadable, "stream", {
  value() {
    throw new Error("fixture read failure");
  },
});
await assert.rejects(() => extractAudioUploadData(unreadable));

const batch = await Promise.allSettled([
  normalizeParsedAudioMetadata(audioFile("good.mp3"), { common: { title: "Good" }, format: {} }),
  extractAudioUploadData(unreadable),
]);
assert.equal(batch[0].status, "fulfilled");
  assert.equal(batch[1].status, "rejected");

  const fixturePath = process.argv[2];
  if (fixturePath) {
    const fixtureBytes = await readFile(fixturePath);
    const fixture = new File([fixtureBytes], "Low Light(1).mp3", {
      type: "audio/mpeg",
    });
    const beforeFixture = Buffer.from(await fixture.arrayBuffer());
    const result = await extractAudioUploadData(fixture);
    const artworkBytes = result.artwork
      ? new Uint8Array(await result.artwork.file.arrayBuffer())
      : null;

    console.log(
      JSON.stringify(
        {
          cleanedTitle: cleanAudioUploadFilename(fixture.name),
          metadata: result.metadata,
          technical: result.technical,
          artwork: result.artwork
            ? {
                mimeType: result.artwork.mimeType,
                size: result.artwork.file.size,
                ...jpegDimensions(artworkBytes || new Uint8Array()),
              }
            : null,
          lyrics: result.lyrics || null,
          warnings: result.warnings,
          sourceBytesUnchanged: beforeFixture.equals(
            Buffer.from(await fixture.arrayBuffer())
          ),
        },
        null,
        2
      )
    );
  }

  console.log("audio upload extraction tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
