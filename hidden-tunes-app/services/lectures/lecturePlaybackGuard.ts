let inflightCanonicalId: string | null = null;

export function isLecturePlaybackInflight(canonicalId?: string | null) {
  if (!inflightCanonicalId) return false;
  if (!canonicalId) return true;
  return inflightCanonicalId === canonicalId;
}

export function getLecturePlaybackInflightId() {
  return inflightCanonicalId;
}

/**
 * Marks a lecture item as loading. Duplicate begin calls for the same id
 * return null so the caller can skip a second resolve/load.
 */
export function beginLecturePlayback(canonicalId: string): (() => void) | null {
  const clean = String(canonicalId || "").trim();
  if (!clean) return null;
  if (inflightCanonicalId === clean) return null;

  inflightCanonicalId = clean;
  return () => {
    if (inflightCanonicalId === clean) {
      inflightCanonicalId = null;
    }
  };
}
