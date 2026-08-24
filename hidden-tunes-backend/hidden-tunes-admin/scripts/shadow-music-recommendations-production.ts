import { SupabaseEmotionalProfileRepository, SupabaseMusicCatalogRepository } from "../lib/musicIntelligence/recommendationRepositories";
import { recommendMusic } from "../lib/musicIntelligence/recommendationService";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import { loadAdminEnv } from "../lib/radioExpansion25k/env";
async function main() {
loadAdminEnv(process.cwd());
const { data, error } = await getSupabaseAdmin().from("songs").select("id").eq("is_public", true).limit(12); if (error) throw error;
const catalog = new SupabaseMusicCatalogRepository(); const profiles = new SupabaseEmotionalProfileRepository(); const results = [];
if (data?.[0]) { await catalog.getSeed(String(data[0].id)); await profiles.getProfiles([String(data[0].id)]); }
for (const row of data ?? []) { const started = performance.now(); const response = await recommendMusic({ seedSongId: String(row.id), limit: 10, journeyIntent: "CONTINUE", generationToken: `shadow-${row.id}` }, "phase-c-shadow", { catalog, profiles }); results.push({ seedSongId: String(row.id), success: response.success, recommendationIds: response.success ? response.recommendations.map((entry) => entry.songId) : [], latencyMs: Number((performance.now() - started).toFixed(2)), error: response.success ? null : response.error }); }
const latencies = results.map((result) => result.latencyMs).sort((a, b) => a - b); const percentile = (p: number) => latencies[Math.ceil(latencies.length * p) - 1];
console.log(JSON.stringify({ mode: "READ_ONLY_SHADOW", lyricsRead: false, productionWrites: 0, warmupExcluded: true, p50Ms: percentile(.5), p95Ms: percentile(.95), results }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
