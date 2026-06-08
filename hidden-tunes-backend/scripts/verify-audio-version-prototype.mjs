import {
  buildSongAudioVersionStatusPayload,
  getSongAudioVersionStatus,
} from "../services/generateSongAudioVersions.js";
import {
  buildAudioVersionsRecord,
  detectTranscodeCapabilities,
  planAudioVersionsForUpload,
} from "../services/audioVersionGeneration.js";
import {
  canTransitionAudioVersionStatus,
  evaluateAudioVersionGenerationLock,
  isAudioVersionTerminalState,
  normalizeAudioVersionStatus,
} from "../services/audioVersionStatus.js";
import { normalizeAudioVersions } from "../services/audioVersions.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makePublicUrl(value) {
  if (!value || typeof value !== "string") return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://cdn.example.test/${value.replace(/^\/+/, "")}`;
}

async function main() {
  const capabilities = await detectTranscodeCapabilities();
  console.log("Capability detection:", capabilities);

  const plan = planAudioVersionsForUpload({
    masterFile: "track.mp3",
    songId: "song-123",
    artistSlug: "Aether Stream",
    albumSlug: "Midnight Echoes",
    songSlug: "aether-stream-neon-dreams",
  });

  console.log("Planned keys:", {
    ultraLight: plan.tiers.ultraLight.r2Key,
    standard: plan.tiers.standard.r2Key,
  });

  assert(
    plan.tiers.ultraLight.r2Key ===
      "songs/aether-stream/midnight-echoes/aether-stream-neon-dreams/ultra-light.m4a",
    "ultra-light R2 key mismatch"
  );
  assert(
    plan.tiers.standard.r2Key ===
      "songs/aether-stream/midnight-echoes/aether-stream-neon-dreams/standard.m4a",
    "standard R2 key mismatch"
  );
  assert(plan.tiers.ultraLight.codec === "aac", "ultraLight codec should be aac");
  assert(plan.tiers.ultraLight.bitrateKbps === 64, "ultraLight bitrate should be 64");
  assert(plan.tiers.ultraLight.offlineEligible === true, "ultraLight offlineEligible");
  assert(plan.tiers.standard.codec === "aac", "standard codec should be aac");
  assert(plan.tiers.standard.bitrateKbps === 160, "standard bitrate should be 160");
  assert(plan.tiers.standard.offlineEligible === false, "standard offlineEligible");

  const audioVersions = buildAudioVersionsRecord({
    ultraLightUrl: makePublicUrl(plan.tiers.ultraLight.r2Key),
    ultraLightKey: plan.tiers.ultraLight.r2Key,
    ultraLightSizeBytes: 512000,
    standardUrl: makePublicUrl(plan.tiers.standard.r2Key),
    standardKey: plan.tiers.standard.r2Key,
    standardSizeBytes: 2048000,
    durationSeconds: 212,
    plan,
  });

  assert(audioVersions?.ultraLight?.url, "audio_versions.ultraLight.url missing");
  assert(audioVersions?.standard?.url, "audio_versions.standard.url missing");
  assert(
    audioVersions.ultraLight.offlineEligible === true,
    "stored ultraLight offlineEligible"
  );
  assert(
    audioVersions.standard.offlineEligible === false,
    "stored standard offlineEligible"
  );

  const normalized = normalizeAudioVersions(audioVersions, makePublicUrl);
  assert(normalized?.ultraLight?.url, "normalized ultraLight url missing");
  assert(normalized?.standard?.url, "normalized standard url missing");

  assert(isAudioVersionTerminalState("ready"), "ready should be terminal");
  assert(isAudioVersionTerminalState("failed"), "failed should be terminal");
  assert(isAudioVersionTerminalState("skipped"), "skipped should be terminal");
  assert(!isAudioVersionTerminalState("pending"), "pending should not be terminal");
  assert(
    !isAudioVersionTerminalState("processing"),
    "processing should not be terminal"
  );

  assert(
    canTransitionAudioVersionStatus("pending", "processing"),
    "pending -> processing allowed"
  );
  assert(
    canTransitionAudioVersionStatus("processing", "ready"),
    "processing -> ready allowed"
  );
  assert(
    !canTransitionAudioVersionStatus("ready", "failed"),
    "ready -> failed blocked"
  );

  const processingLock = evaluateAudioVersionGenerationLock({
    status: "processing",
  });
  assert(!processingLock.allowed && processingLock.action === "reject");

  const readyLock = evaluateAudioVersionGenerationLock({ status: "ready" });
  assert(!readyLock.allowed && readyLock.action === "noop");

  const failedLock = evaluateAudioVersionGenerationLock({ status: "failed" });
  assert(failedLock.allowed && failedLock.reason === "retry_after_failure");

  const forcedReadyLock = evaluateAudioVersionGenerationLock({
    status: "ready",
    force: true,
  });
  assert(forcedReadyLock.allowed && forcedReadyLock.reason === "force_regenerate");

  assert(normalizeAudioVersionStatus("PROCESSING") === "processing");

  const statusPayload = await buildSongAudioVersionStatusPayload({
    id: "song-123",
    audio_version_status: "pending",
    audio_versions: audioVersions,
    r2_audio_key: "songs/demo/track.mp3",
  });
  assert(statusPayload.songId === "song-123");
  assert(statusPayload.hasAudioVersions === true);
  assert(statusPayload.tiers.ultraLight === true);
  assert(statusPayload.tiers.standard === true);

  const missingIdStatus = await getSongAudioVersionStatus({
    supabase: {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async maybeSingle() {
            return { data: null, error: null };
          },
        };
      },
    },
    songId: "missing",
  });
  assert(missingIdStatus.httpStatus === 404);

  console.log("audio_versions shape:", JSON.stringify(audioVersions, null, 2));
  console.log("Audio version infrastructure verification passed.");
}

main().catch((error) => {
  console.error("Audio version infrastructure verification failed:", error);
  process.exitCode = 1;
});
