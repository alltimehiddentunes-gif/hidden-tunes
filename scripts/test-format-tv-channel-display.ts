import { formatTvChannelTitle } from "../utils/formatTvChannelDisplay";

function assertEqual(actual: string, expected: string, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function main() {
  assertEqual(formatTvChannelTitle("WildEarth (1080p)"), "WildEarth", "WildEarth");
  assertEqual(formatTvChannelTitle("Yemen TV (480p)"), "Yemen TV", "Yemen TV");
  assertEqual(
    formatTvChannelTitle("World Poker Tour (1080p)"),
    "World Poker Tour",
    "World Poker Tour"
  );
  assertEqual(formatTvChannelTitle("PromarTV (576p)"), "PromarTV", "PromarTV");
  assertEqual(formatTvChannelTitle("KSBY News (720p)"), "KSBY News", "KSBY News");
  assertEqual(formatTvChannelTitle("BBC News"), "BBC News", "BBC News");
  assertEqual(formatTvChannelTitle("NHK World"), "NHK World", "NHK World");
  // Legitimate branding parentheses must stay.
  assertEqual(
    formatTvChannelTitle("Comedy Central (Extra)"),
    "Comedy Central (Extra)",
    "branding parens"
  );
  // Only trailing resolution suffixes are removed.
  assertEqual(
    formatTvChannelTitle("Local News (1080p) (Extra)"),
    "Local News (1080p) (Extra)",
    "non-trailing resolution"
  );
  assertEqual(formatTvChannelTitle("(1080p)"), "(1080p)", "resolution-only");
  assertEqual(formatTvChannelTitle(""), "", "empty");
  assertEqual(formatTvChannelTitle(null), "", "null");

  console.log("TV channel display title tests passed.");
}

main();
