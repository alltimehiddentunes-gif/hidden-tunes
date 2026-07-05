import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const PUBLIC_BASE =
  process.env.PODCAST_PUBLIC_BASE_URL?.trim() || "https://admin.hiddentunes.com";

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
loadEnvFile(path.join(adminRoot, ".env"));

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

async function main() {
  const categories = ["health", "technology", "business"] as const;
  const report: Record<string, unknown> = {
    base_url: PUBLIC_BASE,
    categories: {},
  };

  for (const category of categories) {
    const { status, payload } = await fetchJson(
      `${PUBLIC_BASE}/api/podcasts/episodes?category=${category}&page=1&limit=40`
    );

    const episodes = Array.isArray(payload?.episodes) ? payload.episodes : [];
    const hasAudioInList = episodes.some(
      (episode: Record<string, unknown>) =>
        typeof episode.audio_url === "string" && episode.audio_url.length > 0
    );

    report.categories = {
      ...(report.categories as Record<string, unknown>),
      [category]: {
        status,
        episode_count: episodes.length,
        has_more: Boolean(payload?.pagination?.hasMore),
        metadata_only: !hasAudioInList,
        sample_episode_id: episodes[0]?.id || null,
      },
    };
  }

  const healthEpisodes = (
    (report.categories as Record<string, { sample_episode_id?: string }>).health ||
    {}
  ).sample_episode_id;

  if (healthEpisodes) {
    const play = await fetchJson(
      `${PUBLIC_BASE}/api/podcasts/episodes/${healthEpisodes}/play`
    );
    report.play_sample = {
      status: play.status,
      has_audio_url: Boolean(play.payload?.audio_url),
      metadata_only_response: !play.payload?.episodes,
    };
  }

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
