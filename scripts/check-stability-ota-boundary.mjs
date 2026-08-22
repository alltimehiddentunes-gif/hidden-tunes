import { execFileSync } from "node:child_process";

const staged = execFileSync("git", ["diff", "--cached", "--name-only"], {
  encoding: "utf8",
}).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);

const nativeBoundary = /^(android|ios)\/|(^|\/)app\.json$|(^|\/)app\.config\.[^/]+$|(^|\/)eas\.json$|(^|\/)package\.json$|(^|\/)(package-lock|yarn\.lock|pnpm-lock)[^/]*$|^plugins\//i;
const blocked = staged.filter((file) => nativeBoundary.test(file.replaceAll("\\", "/")));

if (blocked.length) {
  console.error("NATIVE BOUNDARY CHANGED — OTA publication is blocked:");
  blocked.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

console.log("OTA-COMPATIBLE APPLICATION UPDATE");
console.log(`Staged files inspected: ${staged.length}`);
