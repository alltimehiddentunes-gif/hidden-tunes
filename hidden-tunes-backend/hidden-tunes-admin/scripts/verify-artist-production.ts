const baseUrl = (process.env.ARTIST_VERIFY_BASE_URL || "https://admin.hiddentunes.com").replace(/\/$/, "");
const artistRef = process.env.ARTIST_VERIFY_ARTIST_ID || process.env.ARTIST_VERIFY_ARTIST_SLUG || "";

async function verifyPath(path: string, label: string) {
  const response = await fetch(`${baseUrl}${path}`);
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`${label}: non-JSON response (${response.status})`);
  }
  if (!response.ok) {
    throw new Error(`${label}: HTTP ${response.status} ${String(payload.error || text)}`);
  }
  const serialized = JSON.stringify(payload);
  if (/audio_url|stream_url|embed_url|video_url|source_url/.test(serialized)) {
    throw new Error(`${label}: playable URL leakage detected`);
  }
  console.log(`OK ${label} (${response.status})`);
  return payload;
}

async function main() {
  if (!artistRef) {
    throw new Error("Set ARTIST_VERIFY_ARTIST_ID or ARTIST_VERIFY_ARTIST_SLUG.");
  }

  await verifyPath(`/api/artists/${encodeURIComponent(artistRef)}`, "profile shell");
  await verifyPath(`/api/artists/${encodeURIComponent(artistRef)}/stats`, "stats");
  await verifyPath(`/api/artists/${encodeURIComponent(artistRef)}/top-songs?limit=5`, "top songs");
  await verifyPath(`/api/artists/${encodeURIComponent(artistRef)}/releases?limit=5`, "releases");
  await verifyPath(`/api/artists/${encodeURIComponent(artistRef)}/about`, "about");

  const followResponse = await fetch(`${baseUrl}/api/artists/${encodeURIComponent(artistRef)}/follow`, {
    method: "POST",
  });
  if (followResponse.status !== 401) {
    throw new Error(`Expected unauthenticated follow rejection (401), got ${followResponse.status}`);
  }
  console.log("OK unauthenticated follow rejection (401)");

  console.log(`Artist production verification passed for ${artistRef} on ${baseUrl}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
