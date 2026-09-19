import { normalizeArtistLookup } from "../lib/artistIdentityV1";
import { supabaseAdmin } from "../lib/supabaseAdmin";

function duplicates(values: Array<{ key: string; id: string }>) {
  const grouped = new Map<string, Set<string>>();
  for (const value of values) {
    if (!value.key) continue;
    const ids = grouped.get(value.key) ?? new Set<string>();
    ids.add(value.id);
    grouped.set(value.key, ids);
  }
  return [...grouped.entries()].filter(([, ids]) => ids.size > 1).map(([key, ids]) => ({ key, artistCount: ids.size }));
}

async function main() {
  async function allRows(table: string, select: string) {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 1000) {
      const result = await supabaseAdmin.from(table).select(select).range(offset, offset + 999);
      if (result.error) throw new Error(`${table}: ${result.error.message}`);
      const page = (result.data ?? []) as unknown as Record<string, unknown>[];
      rows.push(...page);
      if (page.length < 1000) return rows;
    }
  }
  async function exactCount(table: string, column: string, value: null) {
    const result = await supabaseAdmin.from(table).select("id", { count: "exact", head: true }).is(column, value);
    if (result.error) throw new Error(`${table}: ${result.error.message}`);
    return result.count ?? 0;
  }
  const [artistRows, aliasRows, externalRows, creditRows, songLinks, albumLinks, tracksMissingArtistUuid, releasesMissingArtistUuid] = await Promise.all([
    allRows("artists", "id,name,slug,merged_into_artist_id"),
    allRows("artist_aliases", "id,artist_id,alias,alias_normalized"),
    allRows("artist_external_ids", "id,artist_id,provider,external_id"),
    allRows("artist_credits", "id,artist_id"),
    allRows("songs", "artist_id"),
    allRows("albums", "artist_id"),
    exactCount("songs", "artist_id", null),
    exactCount("albums", "artist_id", null),
  ]);
  const artistIds = new Set(artistRows.map((row) => String(row.id)));
  const artistsWithContent = new Set([...songLinks, ...albumLinks].map((row) => String(row.artist_id ?? "")).filter(Boolean));
  const report = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    counts: {
      artists: artistRows.length,
      invalidArtistUuids: artistRows.filter((row) => !/^[0-9a-f-]{36}$/i.test(String(row.id))).length,
      duplicateCanonicalNames: duplicates(artistRows.map((row) => ({ key: String(row.name ?? ""), id: String(row.id) }))).length,
      duplicateNormalizedNames: duplicates(artistRows.map((row) => ({ key: normalizeArtistLookup(row.name), id: String(row.id) }))).length,
      duplicateSlugs: duplicates(artistRows.map((row) => ({ key: String(row.slug ?? ""), id: String(row.id) }))).length,
      ambiguousNormalizedAliases: duplicates(aliasRows.map((row) => ({ key: String(row.alias_normalized ?? normalizeArtistLookup(row.alias)), id: String(row.artist_id) }))).length,
      duplicateExternalMappings: duplicates(externalRows.map((row) => ({ key: `${row.provider}:${row.external_id}`, id: String(row.artist_id) }))).length,
      tracksMissingArtistUuid,
      releasesMissingArtistUuid,
      orphanAliases: aliasRows.filter((row) => !artistIds.has(String(row.artist_id))).length,
      orphanExternalIds: externalRows.filter((row) => !artistIds.has(String(row.artist_id))).length,
      orphanCredits: creditRows.filter((row) => !artistIds.has(String(row.artist_id))).length,
      artistsWithoutContent: artistRows.filter((row) => !artistsWithContent.has(String(row.id))).length,
    },
    sampleArtist: artistRows[0] ? { id: String(artistRows[0].id), canonicalName: String(artistRows[0].name ?? "Unknown Artist") } : null,
  };
  console.log(JSON.stringify(report, null, 2));
}

void main();
