import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { extractAudioUploadData } from "../lib/audioUploadExtraction";
import {
  normalizeLyricsForPersistence,
  validateImportedLrc,
} from "../lib/lyricsUploadSafety";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) throw new Error("Pass an audio file path.");

  const bytes = await readFile(filePath);
  const file = new File([bytes], basename(filePath), { type: "audio/mpeg" });
  const extracted = await extractAudioUploadData(file);
  const plainText = extracted.lyrics?.plainText || "";
  const syncedText = extracted.lyrics?.syncedLrcText || "";
  const lrcValidation = syncedText ? validateImportedLrc(syncedText) : null;
  const plainFallback = plainText || (!lrcValidation?.valid ? lrcValidation?.plainText || "" : "");
  const persistenceIfAlignmentFails = normalizeLyricsForPersistence({
    plainLyricsText: plainFallback,
    syncedLrcText: lrcValidation?.valid ? syncedText : "",
  });

  console.log(JSON.stringify({
    filename: basename(filePath),
    lyricSource: extracted.lyrics?.source || null,
    embeddedLyrics: Boolean(plainText || syncedText),
    plainCharacterCount: plainText.length,
    plainLineCount: plainText ? plainText.split(/\r?\n/).filter(Boolean).length : 0,
    embeddedTimestamps: Boolean(syncedText),
    validEmbeddedLrc: lrcValidation?.valid || false,
    timedLineCount: lrcValidation?.timedLineCount || 0,
    synchronized: extracted.lyrics?.synchronized || false,
    rowBeforeAlignment: {
      lyrics: Boolean(plainFallback || syncedText),
      lrc: Boolean(lrcValidation?.valid),
      source: extracted.lyrics?.source || null,
    },
    alignmentEligible: Boolean(plainFallback && !lrcValidation?.valid),
    uploadPayloadIfAlignmentFails: {
      plainLyricsCharacters: plainFallback.length,
      syncedLrcCharacters: 0,
      lyricsSource: "embedded",
    },
    trackLyricsIfAlignmentFails: {
      lyricsType: persistenceIfAlignmentFails.lyricsType,
      hasPlainLyrics: Boolean(persistenceIfAlignmentFails.plainLyrics),
      hasSyncedLrc: Boolean(persistenceIfAlignmentFails.syncedLrc),
      source: "admin_upload_plain",
    },
  }, null, 2));
}

void main();
