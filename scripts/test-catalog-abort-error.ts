import assert from "node:assert/strict";

import {
  isCatalogAbortError,
  isCatalogTimeoutError,
} from "../services/catalogJsonFetch";

const abort = new Error("Aborted");
abort.name = "AbortError";

const attachAbort = new Error("radio_catalog_attach_aborted");
attachAbort.name = "AbortError";

const timeout = new Error("catalog_api_timeout");
timeout.name = "TimeoutError";

assert.equal(isCatalogAbortError(abort), true);
assert.equal(isCatalogAbortError(attachAbort), true);
assert.equal(isCatalogAbortError(new Error("Aborted")), true);
assert.equal(isCatalogAbortError(timeout), false);
assert.equal(isCatalogTimeoutError(timeout), true);
assert.equal(isCatalogTimeoutError(abort), false);

console.log("ok catalog-abort-error-helpers");
