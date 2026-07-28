import assert from "node:assert/strict";

import { computeRetryDelayMs } from "../lib/podcastVerification";

assert.ok(computeRetryDelayMs(1) < computeRetryDelayMs(4));
assert.ok(computeRetryDelayMs(10) <= 3_600_000);

console.log("test-podcast-health-queue passed");
