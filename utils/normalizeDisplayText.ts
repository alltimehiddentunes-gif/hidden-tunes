/**
 * Repair known UTF-8 mojibake that appears when bullet/dash/ellipsis
 * bytes were decoded with the wrong charset. Only proven sequences.
 */

/** Stable metadata separator (bullet U+2022). */
export const META_SEPARATOR = " \u2022 ";

/** Proven mojibake → correct Unicode. Do not add speculative Latin rewrites. */
const MOJIBAKE_REPLACEMENTS: readonly (readonly [string, string])[] = [
  ["\u00d4\u00c7\u00f3", "\u2022"], // misdecoded U+2022 bullet
  ["\u00e2\u20ac\u00a2", "\u2022"], // misdecoded U+2022 bullet (CP1252 path)
  ["\u252c\u00c0", "\u2022"], // misdecoded middle-dot used as separator
  ["\u00d4\u00c7\u00f6", "\u2014"], // misdecoded U+2014 em dash
  ["\u00e2\u20ac\u201d", "\u2014"], // misdecoded U+2014 em dash (CP1252 path)
  ["\u00d4\u00c7\u00aa", "\u2026"], // misdecoded U+2026 ellipsis
];

export function normalizeDisplayText(value: string): string {
  if (!value) return value;
  let out = value;
  for (const [bad, good] of MOJIBAKE_REPLACEMENTS) {
    if (out.includes(bad)) {
      out = out.split(bad).join(good);
    }
  }
  return out;
}

/** Build a metadata line from clean parts (never store a preformatted corrupted string). */
export function joinMetadataParts(
  parts: (string | null | undefined | false)[]
): string {
  return parts
    .map((part) => {
      if (typeof part !== "string") return "";
      return normalizeDisplayText(part.trim());
    })
    .filter(Boolean)
    .join(META_SEPARATOR);
}
