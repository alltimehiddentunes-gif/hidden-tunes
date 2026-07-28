import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { probeStreamUrl } from "@/lib/tvStreamProtocol";
import { importVerifiedTvGrowthCandidates } from "@/lib/tvStationHealth";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadAdminEnv(adminRoot);

async function main() {
  const sb = getSupabaseAdmin();
  const badId = "196ed587-3d6e-4dba-ac9c-6641a1f26a0b";
  const { error } = await sb
    .from("tv_videos")
    .update({
      playback_status: "blocked",
      is_active: false,
      quarantined_at: new Date().toISOString(),
      disabled_at: new Date().toISOString(),
      last_health_error: "russia_tv_deep: news clip misimported as channel",
      reliability_score: 0,
      consecutive_failures: 99,
    })
    .eq("id", badId);
  console.log("quarantine", error?.message || "ok");

  const probes = [
    { title: "ТНВ Планета", url: "https://planeta.mediacdn.ru/cdn/tnvplanet/playlist.m3u8", category: "Regional" },
    { title: "ТНВ", url: "https://user91229.clients-cdnnow.ru/hls/user91229_1.m3u8", category: "Regional" },
    { title: "Майдан ТВ", url: "https://live-maidantv.cdnvideo.ru/maidantv/maidantv.smil/playlist.m3u8", category: "Regional" },
    { title: "Шаян ТВ", url: "https://shayan.bonus-tv.ru/cdn/shayan/playlist.m3u8", category: "Regional" },
    { title: "Москва 24", url: "https://hls-m24.cdnvideo.ru/m24/smil:m24.smil/playlist.m3u8", category: "News" },
    { title: "Москва 24", url: "https://media.m24.ru/hls/m24.m3u8", category: "News" },
    { title: "Москва 24", url: "https://live-m24.cdnvideo.ru/m24/playlist.m3u8", category: "News" },
    { title: "Москва 24", url: "https://vgtrkregion-reg.cdnvideo.ru/vgtrk/moscow/moscow24-hd/index.m3u8", category: "News" },
  ];

  const ok = [];
  for (const p of probes) {
    const r = await probeStreamUrl(p.url);
    console.log(JSON.stringify({ title: p.title, playable: r.playable, reason: r.reason, url: p.url.slice(0, 80) }));
    if (r.playable) ok.push(p);
  }

  if (ok.length) {
    const candidates = ok.map((p, i) => ({
      source_type: "hls_stream",
      source_id: `ru-official-${i}-${p.title.replace(/\s+/g, "-").slice(0, 40)}`,
      source_url: p.url,
      title: p.title,
      channel_name: p.title,
      category: p.category,
      language: "ru",
      country: "RU",
      tags: ["Russia", "RU", "russia-tv-deep", "official"],
      source_key: `russia-tv-deep:official:${Buffer.from(p.url).toString("base64url").slice(0, 24)}`,
    }));
    const result = await importVerifiedTvGrowthCandidates(candidates);
    console.log("import", result);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
