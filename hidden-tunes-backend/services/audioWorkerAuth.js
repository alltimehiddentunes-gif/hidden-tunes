function isProduction() {
  return String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
}

function getConfiguredWorkerSecret() {
  return String(process.env.AUDIO_WORKER_SECRET || "").trim();
}

function getProvidedWorkerSecret(req) {
  return String(req.headers["x-audio-worker-secret"] || "").trim();
}

/**
 * Protect internal audio-version worker routes.
 * Production rejects when AUDIO_WORKER_SECRET is unset.
 */
export function requireAudioWorkerSecret(req, res, next) {
  const configuredSecret = getConfiguredWorkerSecret();

  if (!configuredSecret) {
    const message = isProduction()
      ? "Audio worker secret is not configured."
      : "AUDIO_WORKER_SECRET is not configured on this worker.";

    return res.status(503).json({
      success: false,
      error: message,
    });
  }

  const providedSecret = getProvidedWorkerSecret(req);

  if (!providedSecret || providedSecret !== configuredSecret) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized audio worker request.",
    });
  }

  return next();
}

export function isAudioWorkerProxyConfigured() {
  const workerUrl = String(process.env.AUDIO_WORKER_URL || "").trim();
  const workerSecret = String(process.env.AUDIO_WORKER_SECRET || "").trim();
  return Boolean(workerUrl && workerSecret);
}
