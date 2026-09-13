// Search-only aliases and explicit families. Do not infer genres from moods or titles.
export const MUSIC_SEARCH_GENRES = [
  ["Country",[],["Country Rock","Country Pop","Americana","Country, Love","Love country","Pop, Country","Pop , country"]],
  ["Amapiano",[],[]],
  ["Blues",[],["Soul Blues"]],
  ["Soul Blues",[],["Blues"]],
  ["Gospel",[],["Gospel / Worship","Gospel/Worship","Gospel Pop","Gospel, Worship, Pop"]],
  ["Reggae",[],["Reggae / Dancehall","Reggae/Dancehall"]],
  ["Reggae/Dancehall",["Reggae / Dancehall"],["Reggae","Dancehall"]],
  ["Rock",[],["Alternative Rock","Classic Rock","Indie Rock","Hard Rock","Pop Rock","Country Rock"]],
  ["R&B",["RnB","r and b","rhythm and blues"],["R&B / Soul","R&B/Soul"]],
  ["R&B/Soul",["R&B / Soul"],["R&B","RnB"]],
  ["Pop",[],["Pop, Country","Pop , country","Country Pop","Pop Rock","Gospel Pop","Latin Pop"]],
  ["Afrobeats",["Afrobeat","afro beats","afro-beats"],["Afrobeat ,Afro fusion","Afrobeat, Afro Soul"]],
  ["Afropop",["afro pop","afro-pop"],[]],
  ["Highlife",[],[]],
  ["Hiplife",[],[]],
  ["Hip-Hop",["Hip Hop","hiphop"],["Hip-Hop / Rap","Hip-Hop/Rap","Rap"]],
  ["Hip-Hop/Rap",["Hip-Hop / Rap","Hip Hop / Rap"],["Hip-Hop","Hip Hop","Rap"]],
  ["Rap",[],["Hip-Hop / Rap","Hip-Hop/Rap","Hip-Hop","Hip Hop"]],
  ["Dancehall",[],["Reggae / Dancehall","Reggae/Dancehall"]],
  ["Jazz",[],["Jazz, Instrumentals","French Café Jazz & Chanson"]]
];

export function normalizeGenre(value) {
  return String(value || "").normalize("NFKD").replace(/\p{Mark}+/gu, "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^\p{Letter}\p{Number}]+/gu, " ").trim().replace(/\s+/g, " ");
}

export function resolveGenreIntent(value) {
  const key = normalizeGenre(value);
  return MUSIC_SEARCH_GENRES.find(([label, aliases]) =>
    [label, ...aliases].some(alias => normalizeGenre(alias) === key)) || null;
}

export function genreTiers(intent) {
  if (!intent) return [];
  const [label, aliases, family] = intent;
  return [[label, ...aliases], family].filter(tier => tier.length);
}

export function genreRank(value, intent) {
  const key = normalizeGenre(value);
  const tier = genreTiers(intent).findIndex(values => values.some(label => normalizeGenre(label) === key));
  return tier < 0 ? 0 : 2 - tier;
}

/** Fixed allowlisted labels only, quoted for PostgREST (commas in a genre are data). */
export function genreOrClause(labels) {
  return labels.map(label => `genre.ilike."${label.replace(/"/g, '\\"')}"`).join(",");
}

/** Tier-first database pagination: generic text never consumes genre candidate slots. */
export async function fetchGenrePage(intent, pagination, fetchTier) {
  let offset = pagination.offset;
  const data = [];
  for (const labels of genreTiers(intent)) {
    const result = await fetchTier(labels, offset, pagination.limit - data.length);
    if (result.error) return result;
    if (result.count === null || result.count === undefined) {
      return { data: [], error: { message: "Genre pagination count unavailable" } };
    }
    data.push(...result.data);
    offset = Math.max(0, offset - result.count);
    if (data.length >= pagination.limit) break;
  }
  return { data, error: null, selectMode: "genre_tiers" };
}
