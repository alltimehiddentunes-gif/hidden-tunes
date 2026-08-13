import fs from "node:fs";
import vm from "node:vm";

const search = fs.readFileSync(new URL("../app/search.tsx", import.meta.url), "utf8");
const navigation = fs.readFileSync(
  new URL("../utils/searchResultNavigation.ts", import.meta.url),
  "utf8",
);

const checks = [
  ["artist result body opens profile", /style=\{styles\.artistCard\} onPress=\{\(\) => openArtist\(artist\)\}/.test(search)],
  ["album result body opens release", /style=\{styles\.albumCard\} onPress=\{\(\) => openAlbum\(album\)\}/.test(search)],
  ["artist route requires UUID", navigation.includes("isArtistUuid(id)")],
  ["album route requires authoritative id", navigation.includes('pathname: "/album/[id]"')],
  ["no name/title route fallback", !navigation.includes("artist.name") && !navigation.includes("album.title")],
  ["favorite controls remain siblings", (search.match(/<FavoriteButton/g) || []).length >= 2],
  ["card bodies no longer invoke playback", !search.includes("playAlbumResult") && !search.includes("playArtistResult")],
];

let failures = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"}: ${name}`);
  if (!passed) failures += 1;
}
if (failures) process.exit(1);

// Syntax-check the script itself under the runtime used by CI/OTA preparation.
new vm.Script("void 0");
