type WorkerProxyResult = {
  ok: boolean;
  status: number;
  data: Record<string, unknown> | null;
};

function getWorkerProxyConfig() {
  const workerUrl = String(process.env.AUDIO_WORKER_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const workerSecret = String(process.env.AUDIO_WORKER_SECRET || "").trim();

  return {
    enabled: Boolean(workerUrl && workerSecret),
    workerUrl,
    workerSecret,
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function proxyAudioWorkerRequest({
  method,
  path,
  body,
}: {
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
}): Promise<WorkerProxyResult | null> {
  const config = getWorkerProxyConfig();

  if (!config.enabled) {
    return null;
  }

  const headers: Record<string, string> = {
    "x-audio-worker-secret": config.workerSecret,
  };

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;

  try {
    response = await fetch(`${config.workerUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch (error: unknown) {
    return {
      ok: false,
      status: 502,
      data: {
        success: false,
        error: `Audio worker request failed: ${getErrorMessage(
          error,
          "network error"
        )}`,
      },
    };
  }

  const data = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

export function isAudioWorkerProxyEnabled() {
  return getWorkerProxyConfig().enabled;
}

export async function proxyWorkerGenerateSongAudioVersions(
  songId: string,
  options: { force?: boolean } = {}
) {
  return proxyAudioWorkerRequest({
    method: "POST",
    path: `/internal/audio-versions/songs/${encodeURIComponent(songId)}/generate`,
    body: {
      force: Boolean(options.force),
    },
  });
}

export async function proxyWorkerSongAudioVersionStatus(songId: string) {
  return proxyAudioWorkerRequest({
    method: "GET",
    path: `/internal/audio-versions/songs/${encodeURIComponent(songId)}/status`,
  });
}
