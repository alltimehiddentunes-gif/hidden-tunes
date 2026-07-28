#!/usr/bin/env bash
# Package Concerts overlay for safe production sync (no branch switch).
set -eu
cd "$(dirname "$0")/.."
OUT="${1:-/tmp/concerts-overlay-batch2.tgz}"
tar -czf "$OUT" \
  lib/concerts \
  app/api/concerts \
  scripts/run-concerts-batch2-expansion.ts \
  scripts/run-concerts-import.ts \
  scripts/seed-concert-sources.ts \
  scripts/resolve-concert-channels-html.ts \
  scripts/safe-concerts-production-build.sh \
  scripts/tmp-prod-concert-stats.sh \
  docs/concerts-production-overlay.md \
  data/concert-import-checkpoints 2>/dev/null || true
# ensure dirs exist even if checkpoints missing
tar -czf "$OUT" \
  lib/concerts \
  app/api/concerts \
  scripts/run-concerts-batch2-expansion.ts \
  scripts/run-concerts-import.ts \
  scripts/seed-concert-sources.ts \
  scripts/resolve-concert-channels-html.ts \
  scripts/safe-concerts-production-build.sh \
  scripts/tmp-prod-concert-stats.sh \
  docs/concerts-production-overlay.md
ls -lh "$OUT"
echo "packed:$OUT"
