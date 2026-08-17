export const STARTUP_DESTINATION_TIMEOUT_MS = 2500;

export type StartupDestination = "/music-feed" | "/onboarding";

type StartupDestinationOptions = {
  timeoutMs?: number;
};

/**
 * Resolve the initial route without allowing a stalled storage read to keep the
 * JavaScript startup screen mounted forever. The timeout opens the public app
 * shell; it does not alter onboarding, authentication, playback, or user data.
 */
export async function resolveStartupDestination(
  readOnboardingCompleted: () => Promise<boolean>,
  options: StartupDestinationOptions = {}
): Promise<StartupDestination> {
  const timeoutMs = Math.max(
    0,
    options.timeoutMs ?? STARTUP_DESTINATION_TIMEOUT_MS
  );

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const fallback = new Promise<StartupDestination>((resolve) => {
    timeoutId = setTimeout(() => resolve("/music-feed"), timeoutMs);
  });

  const storedDestination = readOnboardingCompleted()
    .then<StartupDestination>((completed) =>
      completed ? "/music-feed" : "/onboarding"
    )
    .catch<StartupDestination>(() => "/onboarding");

  try {
    return await Promise.race([storedDestination, fallback]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
