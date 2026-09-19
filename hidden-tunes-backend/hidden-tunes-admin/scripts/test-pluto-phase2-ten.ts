import { performance } from "node:perf_hooks";
import { resolveTvPlayback } from "@/lib/tvProviders";
import { validatePlutoActualContent } from "@/lib/tvProviders/pluto/actualContentValidator";

const candidates = [
  { recordId: "c4050d93-24fc-4937-8fb6-b718c0318bcc", channelId: "608181d420fc8500075f612a", expectedName: "Pluto TV Anime", region: "CH", category: "animation", legacyType: "jmp2" },
  { recordId: "4794abfe-39b7-4d19-8ebc-64389f1b9e52", channelId: "69492467ae33e24d916e56cf", expectedName: "Pluto TV Star Trek: Animation", region: "CH", category: "animation", legacyType: "jmp2" },
  { recordId: "786eab41-dec9-4193-8a37-625d9a87d50a", channelId: "5d4947590ba40f75dc29c26b", expectedName: "CC Pluto TV", region: "CH", category: "comedy", legacyType: "jmp2" },
  { recordId: "67529380-9945-4f44-b49a-8e457f54ba5f", channelId: "69b968ba255fecb01f602257", expectedName: "Pluto TV Comedy Therapie", region: "CH", category: "comedy", legacyType: "jmp2" },
  { recordId: "37e50051-5a1a-42d2-9260-1468f7401aee", channelId: "6672f49f61a39900089db68e", expectedName: "Pluto TV Deutsche Comedy", region: "CH", category: "comedy", legacyType: "jmp2" },
  { recordId: "0db64546-2325-4dcb-9ac3-9bff667f86df", channelId: "69b968e011fc7b9e27c0d958", expectedName: "Pluto TV Fran: Beste Mama-Momente", region: "CH", category: "comedy", legacyType: "jmp2" },
  { recordId: "686a334c-9891-4b96-abbb-0358cc2cbd76", channelId: "69a554179a3f3bb488c7d2be", expectedName: "Pluto TV Laughs in Spanish", region: "CH", category: "comedy", legacyType: "jmp2" },
  { recordId: "a9546339-06cb-472d-a5c9-5ebb4faf8f4c", channelId: "69b968ca1c36025fd0a3d92d", expectedName: "Pluto TV Worst of Bundy", region: "CH", category: "comedy", legacyType: "jmp2" },
  { recordId: "c3273e0d-5fed-43c3-898e-e0ce77236173", channelId: "5dc280c9aa218c0009724b4b", expectedName: "Pluto TV Food", region: "CH", category: "cooking", legacyType: "jmp2" },
  { recordId: "a7b1c5a7-aa27-4e2b-88f6-ec33cb3fbd19", channelId: "5d767ae7b456c8cf265ce922", expectedName: "Pluto TV Animals", region: "CH", category: "documentary", legacyType: "jmp2" },
] as const;

async function main() {
  const results = [];
  for (const candidate of candidates) {
    const started = performance.now();
    try {
      const playback = await resolveTvPlayback({ provider: "pluto", providerChannelId: candidate.channelId, region: candidate.region });
      const coldMs = performance.now() - started;
      const cachedStarted = performance.now();
      const cached = await resolveTvPlayback({ provider: "pluto", providerChannelId: candidate.channelId, region: candidate.region });
      const cachedMs = performance.now() - cachedStarted;
      const identityExact = playback.canonicalName === candidate.expectedName && cached.source === playback.source;
      const validation = await validatePlutoActualContent(playback, { observationMs: 30_000 });
      results.push({
        recordId: candidate.recordId,
        providerChannelId: candidate.channelId,
        canonicalName: playback.canonicalName,
        region: candidate.region,
        category: candidate.category,
        legacyState: "LEGACY_UNVERIFIED",
        identityExact,
        provenance: playback.provenance,
        coldMs: Math.round(coldMs),
        cachedMs: Math.round(cachedMs * 100) / 100,
        validation,
      });
    } catch (error) {
      results.push({
        recordId: candidate.recordId,
        providerChannelId: candidate.channelId,
        region: candidate.region,
        category: candidate.category,
        legacyState: "LEGACY_UNVERIFIED",
        identityExact: false,
        error: error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "[redacted-url]") : String(error),
      });
    }
  }
  const counts = results.reduce<Record<string, number>>((acc, row) => {
    const state = "validation" in row ? row.validation.state : "UNKNOWN";
    acc[state] = (acc[state] ?? 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify({
    phase: "PLUTO_TV_RECOVERY_PHASE_2",
    mode: "LOCAL_READ_ONLY_PROOF",
    productionWrites: 0,
    rawPlaybackUrlsEmitted: 0,
    selected: candidates.length,
    counts,
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

