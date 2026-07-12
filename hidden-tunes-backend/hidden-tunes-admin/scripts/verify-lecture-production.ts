const BASE_URL =
  process.env.LECTURE_VERIFY_BASE_URL ||
  process.env.NEXT_PUBLIC_ADMIN_BASE_URL ||
  "https://admin.hiddentunes.com";

type ProbeResult = {
  name: string;
  url: string;
  status: number;
  ok: boolean;
  success?: boolean;
  body?: Record<string, unknown>;
  error?: string;
};

async function probe(name: string, path: string): Promise<ProbeResult> {
  const url = `${BASE_URL}${path}`;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const text = await response.text();
    const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    return {
      name,
      url,
      status: response.status,
      ok: response.ok,
      success: body.success === true,
      body,
    };
  } catch (error) {
    return {
      name,
      url,
      status: 0,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function bodyHasPlayableUrl(body: unknown) {
  const text = JSON.stringify(body || {});
  return (
    text.includes("audio_url") ||
    text.includes("video_url") ||
    text.includes("playable_url")
  );
}

async function main() {
  const results: ProbeResult[] = [];
  results.push(await probe("categories", "/api/lectures/categories"));
  results.push(await probe("search", "/api/lectures/search?q=business&page=1&limit=40"));
  results.push(await probe("category", "/api/lectures/category/business?page=1&limit=40"));

  const categoryBody = results.find((item) => item.name === "category")?.body;
  const lectures = Array.isArray(categoryBody?.lectures)
    ? (categoryBody.lectures as Array<Record<string, unknown>>)
    : [];
  const sample = lectures[0];
  if (sample?.id) {
    results.push(await probe("detail", `/api/lectures/items/${sample.id}`));
    results.push(await probe("play", `/api/lectures/items/${sample.id}/play`));
  }

  const detail = results.find((item) => item.name === "detail");
  const play = results.find((item) => item.name === "play");
  const category = results.find((item) => item.name === "category");
  const pagination = category?.body?.pagination as Record<string, unknown> | undefined;
  const playBody = play?.body || {};

  const summary = {
    base_url: BASE_URL,
    categories_ok: results.find((item) => item.name === "categories")?.success === true,
    search_ok: results.find((item) => item.name === "search")?.success === true,
    category_ok: category?.success === true,
    category_limit: pagination?.limit,
    sample_id: sample?.id || null,
    detail_ok: detail?.success === true,
    detail_has_playable_url: detail ? bodyHasPlayableUrl(detail.body) : null,
    play_ok: play?.success === true,
    play_has_playable_url:
      typeof playBody.audio_url === "string" || typeof playBody.video_url === "string",
    results,
  };

  console.log(JSON.stringify(summary, null, 2));

  const passed =
    summary.categories_ok &&
    summary.search_ok &&
    summary.category_ok &&
    summary.category_limit === 40 &&
    summary.detail_ok &&
    summary.detail_has_playable_url === false &&
    summary.play_ok &&
    summary.play_has_playable_url;

  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[lectures] production verification failed", error);
  process.exit(1);
});

export {};
