import { randomUUID } from "node:crypto";

import { hashRightsValue } from "@/lib/rights/filterSchema";
import type { PlatformRules, RightsBulkAction, RightsPlatform, RightsStatus } from "@/lib/rights/types";

export type MutableRightsRecord = {
  id: string;
  rightsStatus: RightsStatus;
  platforms: PlatformRules;
  providerId?: string | null;
  licenseId?: string | null;
  territories?: string[];
  worldwide?: boolean;
  expiresAt?: string | null;
  reviewAssignee?: string | null;
  notes?: string[];
  version: number;
};

type Entry = { id: string; before: MutableRightsRecord; after: MutableRightsRecord };
export type MemoryChangeSet = { id: string; action: RightsBulkAction; entries: Entry[]; createdAt: string };

function clone(record: MutableRightsRecord): MutableRightsRecord {
  return structuredClone(record);
}

function apply(record: MutableRightsRecord, action: RightsBulkAction) {
  const next = clone(record);
  switch (action.type) {
    case "set_rights_status": next.rightsStatus = action.status; break;
    case "set_platform": next.platforms[action.platform] = action.enabled; break;
    case "set_provider": next.providerId = action.providerId; break;
    case "attach_license": next.licenseId = action.licenseId; break;
    case "set_territories": next.territories = [...action.territories]; next.worldwide = action.worldwide; break;
    case "set_expiry": next.expiresAt = action.expiresAt; break;
    case "assign_review": next.reviewAssignee = action.assigneeId; break;
    case "add_note": next.notes = [...(next.notes ?? []), action.note]; break;
  }
  return next;
}

export class InMemoryRightsEngine {
  private records = new Map<string, MutableRightsRecord>();
  private snapshots = new Map<string, readonly string[]>();
  private idempotency = new Map<string, { actionHash: string; changeset: MemoryChangeSet }>();
  private changesets = new Map<string, MemoryChangeSet>();

  constructor(records: MutableRightsRecord[]) {
    for (const record of records) this.records.set(record.id, clone(record));
  }

  createSnapshot(predicate: (record: Readonly<MutableRightsRecord>) => boolean) {
    const id = randomUUID();
    const ids = [...this.records.values()].filter(predicate).map((record) => record.id);
    this.snapshots.set(id, Object.freeze(ids));
    return { id, count: ids.length, targetHash: hashRightsValue(ids) };
  }

  preview(snapshotId: string, action: RightsBulkAction) {
    const ids = this.snapshots.get(snapshotId);
    if (!ids) throw new Error("snapshot_not_found");
    let wouldChange = 0;
    let unchanged = 0;
    for (const id of ids) {
      const current = this.records.get(id);
      if (!current) continue;
      const next = apply(current, action);
      if (hashRightsValue(current) === hashRightsValue(next)) unchanged++;
      else wouldChange++;
    }
    const summary = { matching: ids.length, wouldChange, unchanged, conflicts: 0 };
    return { ...summary, dryRunHash: hashRightsValue({ snapshotId, action, summary }) };
  }

  execute(snapshotId: string, action: RightsBulkAction, idempotencyKey: string) {
    const actionHash = hashRightsValue(action);
    const replay = this.idempotency.get(idempotencyKey);
    if (replay) {
      if (replay.actionHash !== actionHash) throw new Error("idempotency_conflict");
      return { ...replay.changeset, idempotent: true };
    }
    const ids = this.snapshots.get(snapshotId);
    if (!ids) throw new Error("snapshot_not_found");
    const entries: Entry[] = [];
    for (const id of ids) {
      const current = this.records.get(id);
      if (!current) continue;
      const next = apply(current, action);
      if (hashRightsValue(current) === hashRightsValue(next)) continue;
      next.version = current.version + 1;
      this.records.set(id, next);
      entries.push({ id, before: clone(current), after: clone(next) });
    }
    const changeset = { id: randomUUID(), action, entries, createdAt: new Date().toISOString() };
    this.changesets.set(changeset.id, changeset);
    this.idempotency.set(idempotencyKey, { actionHash, changeset });
    return { ...changeset, idempotent: false };
  }

  rollback(changesetId: string) {
    const changeset = this.changesets.get(changesetId);
    if (!changeset) throw new Error("changeset_not_found");
    let restored = 0;
    const conflicts: string[] = [];
    for (const entry of changeset.entries) {
      const current = this.records.get(entry.id);
      if (!current || current.version !== entry.after.version || hashRightsValue(current) !== hashRightsValue(entry.after)) {
        conflicts.push(entry.id);
        continue;
      }
      this.records.set(entry.id, { ...clone(entry.before), version: current.version + 1 });
      restored++;
    }
    return { restored, conflicts };
  }

  mutateAfterChangeset(id: string, platform: RightsPlatform, enabled: boolean) {
    const record = this.records.get(id);
    if (!record) throw new Error("record_not_found");
    record.platforms[platform] = enabled;
    record.version++;
  }

  get(id: string) {
    const record = this.records.get(id);
    return record ? clone(record) : null;
  }
}

