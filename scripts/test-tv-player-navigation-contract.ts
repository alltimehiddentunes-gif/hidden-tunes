/**
 * Alias coverage for TV player navigation singleton rules.
 * Detailed cases live in test-tv-pip-restore-contract.ts.
 */
import {
  shouldForceFullPlayerOnAppForegroundAlone,
  shouldNavigateOnPipStart,
  shouldOpenTvPlayerRoute,
} from "../services/tv/tvPlayerNavigationContract";

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(`FAIL: ${label}`);
}

function main() {
  assert(!shouldNavigateOnPipStart(), "nav: PiP start does not navigate");
  assert(
    !shouldForceFullPlayerOnAppForegroundAlone(),
    "nav: foreground alone does not force full player"
  );
  assert(
    !shouldOpenTvPlayerRoute({
      reason: "pip-restore",
      sessionActive: true,
      routeIsTvPlayer: true,
      presentationMode: "fullPlayer",
    }).navigate,
    "nav: restore reuses existing /tv-player"
  );
  console.log("TV player navigation contract tests passed.");
}

main();
