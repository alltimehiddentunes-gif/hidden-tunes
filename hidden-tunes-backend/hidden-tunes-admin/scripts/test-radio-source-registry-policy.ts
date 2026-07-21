import assert from "node:assert/strict";
import {
  isRejectedPlaylistUrl,
  listEnabledRadioSources,
  listPendingApprovalRadioSources,
  RADIO_METADATA_PRECEDENCE,
} from "@/lib/radioExpansion25k/sourceRegistry";

const enabled = listEnabledRadioSources().map((s) => s.source_name).sort();
assert.deepEqual(enabled, [
  "broadcaster_published_playlists",
  "hidden_tunes_trusted_catalog",
  "icecast_yp",
  "radio_browser",
]);
assert.equal(listPendingApprovalRadioSources().length, 0);
assert.ok(RADIO_METADATA_PRECEDENCE.includes("broadcaster_owned_published"));

assert.equal(isRejectedPlaylistUrl("https://example.com/live.m3u").rejected, false);
assert.equal(isRejectedPlaylistUrl("https://cdn.example/x?token=abc").reason, "tokenized_or_signed_url");
assert.equal(isRejectedPlaylistUrl("https://cdn.example/x?signature=1&expires=9").rejected, true);
assert.equal(isRejectedPlaylistUrl("https://x/drm/widevine").rejected, true);
assert.equal(isRejectedPlaylistUrl("").rejected, true);

console.log(JSON.stringify({ ok: true, enabled }, null, 2));
