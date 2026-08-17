import assert from "node:assert/strict";

import {
  STARTUP_DESTINATION_TIMEOUT_MS,
  resolveStartupDestination,
} from "../utils/startupDestination";

async function main() {
  assert.equal(
    await resolveStartupDestination(async () => true, { timeoutMs: 50 }),
    "/music-feed",
    "completed onboarding should open the app shell"
  );

  assert.equal(
    await resolveStartupDestination(async () => false, { timeoutMs: 50 }),
    "/onboarding",
    "first launch should preserve onboarding"
  );

  assert.equal(
    await resolveStartupDestination(async () => {
      throw new Error("storage unavailable");
    }, { timeoutMs: 50 }),
    "/onboarding",
    "storage failures should fail safely to onboarding"
  );

  let resolveLateRead: ((value: boolean) => void) | undefined;
  const hangingRead = new Promise<boolean>((resolve) => {
    resolveLateRead = resolve;
  });
  const startedAt = Date.now();
  assert.equal(
    await resolveStartupDestination(() => hangingRead, { timeoutMs: 20 }),
    "/music-feed",
    "a hanging storage read must not hold the startup screen indefinitely"
  );
  assert.ok(Date.now() - startedAt < 500, "startup fallback should remain bounded");
  resolveLateRead?.(false);

  assert.equal(
    STARTUP_DESTINATION_TIMEOUT_MS,
    2500,
    "the production fallback must stay inside the three-second startup contract"
  );

  console.log("startup destination contracts passed");
}

void main();
