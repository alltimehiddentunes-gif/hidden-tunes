/**
 * Adaptive fixture / Sports TV grid columns from available width.
 * Normal phones must stay at 2 columns — never default back to 1.
 */
export function sportsFixtureGridColumns(
  availableWidth: number,
  options?: { minCardWidth?: number; gap?: number }
): number {
  const gap = options?.gap ?? 12;
  const minCard = options?.minCardWidth ?? 148;
  const width = Math.max(0, Number(availableWidth) || 0);

  if (width < 300) return 1;
  if (width >= 1000) {
    return Math.min(4, Math.max(3, Math.floor((width + gap) / (minCard + gap))));
  }
  if (width >= 700) {
    return Math.min(3, Math.max(2, Math.floor((width + gap) / (minCard + gap))));
  }

  // Normal / large phones: prefer 2 when two min-width cards fit.
  const twoFit = width >= minCard * 2 + gap;
  return twoFit ? 2 : 1;
}
