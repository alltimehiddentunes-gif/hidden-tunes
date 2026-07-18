import { redactSecrets } from "../http";

export function logSportsEvent(
  event: string,
  payload: Record<string, unknown> = {}
) {
  // Never log secrets / permanent stream URLs.
  console.info(
    JSON.stringify({
      scope: "sports",
      event,
      at: new Date().toISOString(),
      payload: redactSecrets(payload),
    })
  );
}
