/**
 * One-shot genre-anchor handoff: tap → navigation → room/discovery.
 * Survives Expo param loss; must be consumed by Room Detail.
 */

let pendingGenreAnchor: {
  moodTitle: string;
  genreAnchor: string;
  setAt: number;
} | null = null;

export function setPendingGenreMoodAnchor(input: {
  moodTitle: string;
  genreAnchor: string;
}) {
  const moodTitle = String(input.moodTitle || "").trim();
  const genreAnchor = String(input.genreAnchor || "").trim();
  if (!moodTitle || !genreAnchor) return;
  pendingGenreAnchor = {
    moodTitle,
    genreAnchor,
    setAt: Date.now(),
  };
}

export function consumePendingGenreMoodAnchor(moodTitle?: string): string | null {
  if (!pendingGenreAnchor) return null;
  if (Date.now() - pendingGenreAnchor.setAt > 60_000) {
    pendingGenreAnchor = null;
    return null;
  }
  const wanted = String(moodTitle || "").trim().toLowerCase();
  if (
    wanted &&
    pendingGenreAnchor.moodTitle.toLowerCase() !== wanted &&
    !wanted.includes(pendingGenreAnchor.moodTitle.toLowerCase()) &&
    !pendingGenreAnchor.moodTitle.toLowerCase().includes(wanted)
  ) {
    return null;
  }
  const genre = pendingGenreAnchor.genreAnchor;
  pendingGenreAnchor = null;
  return genre;
}

export function peekPendingGenreMoodAnchor(): string | null {
  if (!pendingGenreAnchor) return null;
  if (Date.now() - pendingGenreAnchor.setAt > 60_000) {
    pendingGenreAnchor = null;
    return null;
  }
  return pendingGenreAnchor.genreAnchor;
}
