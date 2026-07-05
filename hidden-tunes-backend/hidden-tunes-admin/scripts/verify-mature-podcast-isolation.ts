export {};

export {};

const BASE = "https://admin.hiddentunes.com";

const MATURE_SHOW_SLUGS = [
  "mature-whoreible-decisions",
  "mature-off-topic",
  "mature-call-her-daddy",
];

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

function episodeHasAudioUrl(episode: Record<string, unknown> | null | undefined) {
  return Boolean(episode && "audio_url" in episode && episode.audio_url);
}

async function main() {
  const results: Record<string, unknown> = {};

  const comedy = await fetchJson(`${BASE}/api/podcasts/episodes?category=comedy&limit=40`);
  const comedyEpisodes = Array.isArray(comedy.body?.episodes) ? comedy.body.episodes : [];
  const comedyMatureLeak = comedyEpisodes.filter((episode: { show_id?: string; title?: string }) =>
    /decisions|whoreible|off topic|call her daddy|girls gotta eat/i.test(
      String(episode.title || "")
    )
  );

  results.normal_comedy_no_mature_leak = {
    status: comedy.status,
    total: comedy.body?.pagination?.total ?? null,
    leaked_titles: comedyMatureLeak.map((episode: { title?: string }) => episode.title),
    pass: comedyMatureLeak.length === 0,
  };

  const search = await fetchJson(`${BASE}/api/podcasts/episodes?q=whoreible&limit=10`);
  const searchEpisodes = Array.isArray(search.body?.episodes) ? search.body.episodes : [];
  results.normal_search_no_mature = {
    status: search.status,
    count: searchEpisodes.length,
    pass: searchEpisodes.length === 0,
  };

  const matureBlocked = await fetchJson(`${BASE}/api/podcasts/mature/episodes?limit=3`);
  results.mature_gate_blocked = {
    status: matureBlocked.status,
    pass: matureBlocked.status === 403,
  };

  const matureOpen = await fetchJson(
    `${BASE}/api/podcasts/mature/episodes?mature_enabled=true&age_confirmed=true&limit=3`
  );
  const matureItems = Array.isArray(matureOpen.body?.items)
    ? matureOpen.body.items
    : [];
  results.mature_gate_open = {
    status: matureOpen.status,
    count: matureItems.length,
    sample_has_audio_url: episodeHasAudioUrl(matureItems[0]),
    pass:
      matureOpen.status === 200 &&
      matureItems.length > 0 &&
      !episodeHasAudioUrl(matureItems[0]),
  };

  const matureCategory = await fetchJson(
    `${BASE}/api/podcasts/mature/episodes?mature_enabled=true&age_confirmed=true&category=mature-comedy&limit=3`
  );
  const categoryItems = Array.isArray(matureCategory.body?.items)
    ? matureCategory.body.items
    : [];
  results.mature_category_page = {
    status: matureCategory.status,
    count: categoryItems.length,
    pass: matureCategory.status === 200 && categoryItems.length > 0,
  };

  const showBlocked = await fetchJson(
    `${BASE}/api/podcasts/episodes?show_id=mature-whoreible-decisions&limit=3`
  );
  results.direct_mature_show_blocked_without_gate = {
    status: showBlocked.status,
    count: Array.isArray(showBlocked.body?.episodes)
      ? showBlocked.body.episodes.length
      : 0,
    pass:
      showBlocked.status === 200 &&
      (showBlocked.body?.episodes?.length || 0) === 0,
  };

  const episodeId = matureItems[0]?.id;
  if (episodeId) {
    const playBlocked = await fetchJson(
      `${BASE}/api/podcasts/mature/episodes/${episodeId}/play`
    );
    const playOpen = await fetchJson(
      `${BASE}/api/podcasts/mature/episodes/${episodeId}/play?mature_enabled=true&age_confirmed=true`
    );
    results.mature_play_gate = {
      blocked_status: playBlocked.status,
      open_status: playOpen.status,
      has_audio_url: Boolean(playOpen.body?.audio_url),
      pass:
        playBlocked.status === 403 &&
        playOpen.status === 200 &&
        Boolean(playOpen.body?.audio_url),
    };

    const normalPlayBlocked = await fetchJson(
      `${BASE}/api/podcasts/episodes/${episodeId}/play`
    );
    results.normal_play_blocks_mature = {
      status: normalPlayBlocked.status,
      pass: normalPlayBlocked.status === 403,
    };
  }

  console.log(JSON.stringify(results, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
