/**
 * Live lectures resolve + media probe (no signed URL bodies printed).
 * Run: npx tsx scripts/probe-lecture-playback.mjs
 */
const BASE = "https://admin.hiddentunes.com";

function isEducationalAudioPlayback(mediaType, playableUrl) {
  const type = String(mediaType || "").toLowerCase();
  const url = String(playableUrl || "").trim();
  if (type === "audio") return true;
  if (type === "video" && /^https:\/\/.+\.mp4(?:\?|$)/i.test(url)) return true;
  return /^https:\/\/.+\.(mp3|m4a|aac|wav|ogg|mp4)(?:\?|$)/i.test(url);
}

function urlDiag(url) {
  try {
    const u = new URL(url);
    return {
      hasUrl: true,
      host: u.host,
      hasQuery: Boolean(u.searchParams.toString()),
      pathLeaf: u.pathname.split("/").pop() || "",
    };
  } catch {
    return { hasUrl: false, host: null, hasQuery: false, pathLeaf: "" };
  }
}

const cases = [
  { label: "MP3", id: "7dbe35a7-dab2-4838-ad74-6217a89fb7fb" },
  { label: "MP4", id: "3f697c58-bf8a-4bbd-9af1-00bbe995bcc0" },
  { label: "KNOWN_FAIL_BEFORE_BINDING", id: "9f4cc3d2-f076-4164-afc1-310f6447720d" },
];

for (const c of cases) {
  const res = await fetch(`${BASE}/api/lectures/items/${c.id}/play`, {
    headers: { Accept: "application/json" },
  });
  const body = await res.json();
  const url = String(body.playableUrl || body.playback_url || "").trim();
  const diag = urlDiag(url);
  let probe = { status: 0, contentType: null, acceptRanges: null };
  if (url) {
    const head = await fetch(url, { method: "HEAD" });
    probe = {
      status: head.status,
      contentType: head.headers.get("content-type"),
      acceptRanges: head.headers.get("accept-ranges"),
    };
  }
  const gatePass = isEducationalAudioPlayback(body.mediaType, url);
  const mediaOk =
    probe.status >= 200 &&
    probe.status < 300 &&
    /^(audio|video)\//i.test(String(probe.contentType || ""));

  console.log(
    JSON.stringify({
      label: c.label,
      lectureId: c.id,
      resolverStatus: res.status,
      resolverFields: Object.keys(body).sort(),
      mediaType: body.mediaType,
      mimeType: body.mimeType,
      ...diag,
      probeStatus: probe.status,
      probeContentType: probe.contentType,
      probeAcceptRanges: probe.acceptRanges,
      urlProbeReturnedMedia: mediaOk,
      gatePass,
      wouldCallSharedPlayer: gatePass && mediaOk,
      priorFailureMode: "bindings_null_before_layout_mount",
    })
  );
}
