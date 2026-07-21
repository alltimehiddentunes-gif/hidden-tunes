export type TvSearchDedupeRow = {
  id?: string | null;
  source_key?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  source_url?: string | null;
  title?: string | null;
  region?: string | null;
};

export type TvSearchDedupeIndex = {
  ids: Set<string>;
  sourceKeys: Set<string>;
  urlKeys: Set<string>;
  titleRegionKeys: Set<string>;
};

export function normalizeTvSearchUrlKey(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function normalizeTvSearchTitleRegionKey(
  title: string | null | undefined,
  region?: string | null
) {
  return `${String(title || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")}::${String(region || "")
    .trim()
    .toLowerCase()}`;
}

export function buildTvSearchDedupeIndex(rows: TvSearchDedupeRow[]): TvSearchDedupeIndex {
  const ids = new Set<string>();
  const sourceKeys = new Set<string>();
  const urlKeys = new Set<string>();
  const titleRegionKeys = new Set<string>();

  for (const row of rows) {
    const id = String(row.id || "").trim();
    if (id) ids.add(id);

    const sourceKey = String(
      row.source_key || `${row.source_type || ""}:${row.source_id || ""}`
    ).trim();
    if (sourceKey && sourceKey !== ":") sourceKeys.add(sourceKey);

    const urlKey = normalizeTvSearchUrlKey(row.source_url);
    if (urlKey) urlKeys.add(urlKey);

    titleRegionKeys.add(normalizeTvSearchTitleRegionKey(row.title, row.region));
  }

  return { ids, sourceKeys, urlKeys, titleRegionKeys };
}

export function isTvSearchRowDuplicateOfIndex(
  row: TvSearchDedupeRow,
  index: TvSearchDedupeIndex
) {
  const id = String(row.id || "").trim();
  if (id && index.ids.has(id)) return true;

  const sourceKey = String(
    row.source_key || `${row.source_type || ""}:${row.source_id || ""}`
  ).trim();
  if (sourceKey && sourceKey !== ":" && index.sourceKeys.has(sourceKey)) return true;

  const urlKey = normalizeTvSearchUrlKey(row.source_url);
  if (urlKey && index.urlKeys.has(urlKey)) return true;

  const titleRegionKey = normalizeTvSearchTitleRegionKey(row.title, row.region);
  if (titleRegionKey !== "::" && index.titleRegionKeys.has(titleRegionKey)) return true;

  return false;
}

export function filterDiscoveryRowsAgainstVerifiedIndex<T extends TvSearchDedupeRow>(
  rows: T[],
  verifiedIndex: TvSearchDedupeIndex
) {
  return rows.filter((row) => !isTvSearchRowDuplicateOfIndex(row, verifiedIndex));
}
