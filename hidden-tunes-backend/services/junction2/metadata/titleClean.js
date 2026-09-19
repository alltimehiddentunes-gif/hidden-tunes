/** Presentation title cleaning — preserve version-identifying tokens. */

const STRIP_NOISE = [
  /\(\s*official\s*(music\s*)?video\s*\)/gi,
  /\[\s*official\s*(music\s*)?video\s*\]/gi,
  /\(\s*official\s*audio\s*\)/gi,
  /\[\s*official\s*audio\s*\]/gi,
  /\(\s*official\s*lyric\s*video\s*\)/gi,
  /\[\s*official\s*lyric\s*video\s*\]/gi,
  /\(\s*lyrics?\s*\)/gi,
  /\[\s*lyrics?\s*\]/gi,
  /\(\s*visuali[sz]er\s*\)/gi,
  /\[\s*visuali[sz]er\s*\]/gi,
  /\(\s*(4k|1080p|720p|hd|uhd)\s*(remaster(ed)?)?\s*\)/gi,
  /\[\s*(4k|1080p|720p|hd|uhd)\s*(remaster(ed)?)?\s*\]/gi,
  /\bofficial\s*(music\s*)?video\b/gi,
  /\bofficial\s*audio\b/gi,
  /\bmusic\s*video\b/gi,
  /\blyrics?\b/gi,
  /\bvisuali[sz]er\b/gi,
];

const KEEP_VERSION =
  /\b(live|remix|acoustic|instrumental|radio\s*edit|remaster(ed)?|sped\s*up|slowed|cover|deluxe|extended|edit)\b/i;

export function cleanPresentationTitle(rawTitle, rawArtist = "") {
  const original = String(rawTitle || "").trim();
  if (!original) return { displayTitle: "Untitled", sourceTitle: original, versionHints: [] };

  let working = original;
  // "Artist - Title (Official Video)" → prefer right side when artist already known.
  const artist = String(rawArtist || "").trim();
  if (artist) {
    const dashed = working.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (dashed) {
      const left = dashed[1].trim();
      const right = dashed[2].trim();
      if (fold(left) === fold(artist) || fold(left).includes(fold(artist))) {
        working = right;
      }
    }
  }

  for (const re of STRIP_NOISE) {
    working = working.replace(re, " ");
  }
  working = working.replace(/\s{2,}/g, " ").replace(/^[-–—:\s]+|[-–—:\s]+$/g, "").trim();
  if (!working) working = original;

  const versionHints = [];
  const hintSource = `${original} ${working}`;
  for (const match of hintSource.matchAll(
    /\b(live|remix|acoustic|instrumental|radio edit|remaster(?:ed)?|sped up|slowed|cover)\b/gi,
  )) {
    const token = match[0].toLowerCase();
    if (!versionHints.includes(token)) versionHints.push(token);
  }

  return {
    displayTitle: working,
    sourceTitle: original,
    versionHints,
    preservesVersion: KEEP_VERSION.test(original),
  };
}

function fold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
