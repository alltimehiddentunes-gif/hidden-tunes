export function resolveCategoryArtworkUrl(
  category: { artworkUrl?: string | null; imageUrl?: string | null } | null | undefined
): string | null {
  const url = String(category?.artworkUrl || category?.imageUrl || "").trim();
  if (!url || !url.startsWith("http")) return null;
  return url;
}
