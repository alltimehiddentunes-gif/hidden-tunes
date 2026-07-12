import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const BASE = process.env.MOTIVATION_VERIFY_BASE_URL || "https://admin.hiddentunes.com";

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(adminRoot, ".env.local"));

async function probe(pathname: string) {
  const url = `${BASE}${pathname}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    const body = await response.json().catch(() => ({}));
    return {
      url,
      status: response.status,
      success: body?.success === true,
      error: body?.error || null,
      details: body?.details || null,
      total:
        Number(body?.pagination?.total) ||
        Number(body?.categories?.length) ||
        Number(body?.items?.length) ||
        0,
      sample_has_stream_url: Boolean(
        body?.items?.[0]?.stream_url ||
          body?.item?.stream_url ||
          body?.items?.[0]?.source_url
      ),
    };
  } catch (error) {
    return {
      url,
      status: 0,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      details: null,
      total: 0,
      sample_has_stream_url: false,
    };
  }
}

async function main() {
  const endpoints = {
    categories: await probe("/api/motivation/categories"),
    search: await probe("/api/motivation/search?q=focus&limit=1"),
    focus: await probe("/api/motivation/category/focus?limit=1"),
  };

  let detail: Record<string, unknown> | null = null;
  let play: Record<string, unknown> | null = null;

  const focus = await probe("/api/motivation/category/focus?limit=1");
  const sampleId = (focus as { items?: Array<{ id?: string }> }).items?.[0]?.id;
  if (sampleId) {
    detail = await probe(`/api/motivation/items/${encodeURIComponent(sampleId)}`);
    play = await probe(`/api/motivation/items/${encodeURIComponent(sampleId)}/play`);
  }

  console.log(
    JSON.stringify(
      {
        base_url: BASE,
        endpoints,
        detail,
        play,
        metadata_leak: endpoints.search.sample_has_stream_url || focus.sample_has_stream_url,
        play_has_stream_url: Boolean((play as { stream_url?: string } | null)?.stream_url),
      },
      null,
      2
    )
  );

  const ok =
    endpoints.categories.success &&
    endpoints.search.success &&
    endpoints.focus.success &&
    !endpoints.search.sample_has_stream_url;

  if (!ok) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
