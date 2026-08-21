import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const player = readFileSync(resolve(process.cwd(), "app/player.tsx"), "utf8");

assert.match(player, /useSafeAreaInsets/);
assert.match(player, /const insets = useSafeAreaInsets\(\)/);
assert.match(
  player,
  /paddingTop: Math\.max\(insets\.top \+ 8, compactLayout \? 44 : 38\)/,
  "player header must clear Dynamic Island and notches"
);

console.log("PASS: player header safe-area contract");
