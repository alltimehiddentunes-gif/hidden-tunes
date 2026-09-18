/** Conservative artist parsing — do not invent relationships. */

const FEAT_SPLIT = /\s+(?:feat\.?|ft\.?|featuring)\s+/i;
const AMP_SPLIT = /\s+(?:&|and|x|×)\s+/i;

export function parseArtistCredits(rawArtist) {
  const sourceArtist = String(rawArtist || "").trim();
  if (!sourceArtist) {
    return {
      primaryArtist: "Unknown Artist",
      featuredArtists: [],
      collaborators: [],
      sourceArtist: "",
      artists: [{ name: "Unknown Artist", role: "primary" }],
    };
  }

  let primary = sourceArtist;
  const featured = [];
  const featParts = sourceArtist.split(FEAT_SPLIT);
  if (featParts.length > 1) {
    primary = featParts[0].trim();
    for (const part of featParts.slice(1)) {
      const name = part.trim();
      if (name) featured.push(name);
    }
  }

  const collaborators = [];
  if (AMP_SPLIT.test(primary) && !FEAT_SPLIT.test(sourceArtist)) {
    const bits = primary.split(AMP_SPLIT).map((s) => s.trim()).filter(Boolean);
    if (bits.length >= 2 && bits.length <= 3) {
      primary = bits[0];
      collaborators.push(...bits.slice(1));
    }
  }

  const artists = [
    { name: primary || sourceArtist, role: "primary" },
    ...featured.map((name) => ({ name, role: "featured" })),
    ...collaborators.map((name) => ({ name, role: "collaborator" })),
  ];

  return {
    primaryArtist: primary || sourceArtist,
    featuredArtists: featured,
    collaborators,
    sourceArtist,
    artists,
  };
}
