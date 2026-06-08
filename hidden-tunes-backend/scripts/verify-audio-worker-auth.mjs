import { isAudioWorkerProxyConfigured } from "../services/audioWorkerAuth.js";
import { evaluateAudioVersionGenerationLock } from "../services/audioVersionStatus.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const originalSecret = process.env.AUDIO_WORKER_SECRET;
  const originalUrl = process.env.AUDIO_WORKER_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  delete process.env.AUDIO_WORKER_SECRET;
  delete process.env.AUDIO_WORKER_URL;
  process.env.NODE_ENV = "production";

  assert(
    isAudioWorkerProxyConfigured() === false,
    "proxy should be disabled without env"
  );

  process.env.AUDIO_WORKER_URL = "https://worker.example.test";
  process.env.AUDIO_WORKER_SECRET = "test-secret";

  assert(
    isAudioWorkerProxyConfigured() === true,
    "proxy should be enabled with url + secret"
  );

  const processingLock = evaluateAudioVersionGenerationLock({
    status: "processing",
  });
  assert(!processingLock.allowed && processingLock.action === "reject");

  process.env.AUDIO_WORKER_SECRET = originalSecret;
  process.env.AUDIO_WORKER_URL = originalUrl;
  process.env.NODE_ENV = originalNodeEnv;

  console.log("Audio worker auth verification passed.");
}

main().catch((error) => {
  console.error("Audio worker auth verification failed:", error);
  process.exitCode = 1;
});
