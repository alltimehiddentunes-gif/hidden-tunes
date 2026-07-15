/** Runtime guards — dry-run must never reach database write paths. */

let databaseWrites = 0;
let publicationWrites = 0;

export function resetDryRunWriteCounters() {
  databaseWrites = 0;
  publicationWrites = 0;
}

export function recordDatabaseWrite(count = 1) {
  databaseWrites += count;
}

export function recordPublicationWrite(count = 1) {
  publicationWrites += count;
}

export function getDryRunWriteMetrics() {
  return {
    database_writes: databaseWrites,
    publication_writes: publicationWrites,
  };
}

export function assertDryRunNoWrites(dryRun: boolean) {
  if (!dryRun) return;
  if (databaseWrites > 0 || publicationWrites > 0) {
    throw new Error(
      `DRY RUN violation: database_writes=${databaseWrites} publication_writes=${publicationWrites}`
    );
  }
}

export function guardDatabaseWrite(dryRun: boolean, operation: string) {
  if (dryRun) {
    throw new Error(`DRY RUN: database writes disabled (${operation})`);
  }
}
