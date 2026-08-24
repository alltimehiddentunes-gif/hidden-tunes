import { createScopedActionLock } from "../../utils/scopedActionLock";

export type RemoteSkipDirection = "next" | "previous";

export type RemoteTransportSkipGate = {
  run: (input: {
    direction: RemoteSkipDirection;
    owner: string | null;
    isOwnerCurrent: () => boolean;
    action: () => Promise<void>;
  }) => Promise<"completed" | "dropped" | "stale_owner">;
  dispose: () => void;
  isLocked: () => boolean;
};

/**
 * One bounded, non-queuing gate for remote Next/Previous transitions.
 * The first command executes immediately; commands arriving while it is in
 * flight are discarded so CarPlay cannot build a stale transition backlog.
 */
export function createRemoteTransportSkipGate(
  timeoutMs = 15_000
): RemoteTransportSkipGate {
  const lock = createScopedActionLock(timeoutMs);

  return {
    async run({ direction, owner, isOwnerCurrent, action }) {
      if (!lock.tryAcquire(`${owner}:${direction}`)) return "dropped";

      try {
        if (!isOwnerCurrent()) return "stale_owner";
        await action();
        return "completed";
      } finally {
        lock.release();
      }
    },
    dispose: lock.dispose,
    isLocked: lock.isLocked,
  };
}
