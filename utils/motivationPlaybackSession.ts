import type { MotivationItem, MotivationProgram } from "@/types/motivation";
import { orderMotivationItems } from "@/utils/motivationPlaybackAdapter";

export type MotivationPlaybackSession = {
  programId: string;
  program: MotivationProgram;
  contextType: string;
  contextSlug?: string;
  loadedItems: MotivationItem[];
  nextPage: number;
  hasMore: boolean;
  currentItemId: string;
  currentItemIndex: number;
  queueGeneration: number;
  skipFailures: number;
};

let activeSession: MotivationPlaybackSession | null = null;

function dedupePreserveOrder(items: MotivationItem[]) {
  const seen = new Set<string>();
  const next: MotivationItem[] = [];
  for (const item of items) {
    const id = String(item?.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push(item);
  }
  return next;
}

export function getMotivationPlaybackSession() {
  return activeSession;
}

export function clearMotivationPlaybackSession() {
  activeSession = null;
}

export function createMotivationPlaybackSession(input: {
  program: MotivationProgram;
  items: MotivationItem[];
  startItemId: string;
  contextType: string;
  contextSlug?: string;
  nextPage: number;
  hasMore: boolean;
  queueGeneration: number;
}) {
  // Preserve caller order (program → speaker → category). Do not re-sort.
  const loadedItems = dedupePreserveOrder(input.items);
  const startIndex = Math.max(
    0,
    loadedItems.findIndex((item) => item.id === input.startItemId)
  );
  activeSession = {
    programId: input.program.id,
    program: input.program,
    contextType: input.contextType,
    contextSlug: input.contextSlug,
    loadedItems,
    nextPage: input.nextPage,
    hasMore: input.hasMore,
    currentItemId: loadedItems[startIndex]?.id || input.startItemId,
    currentItemIndex: Math.max(0, startIndex),
    queueGeneration: input.queueGeneration,
    skipFailures: 0,
  };
  return activeSession;
}

export function appendMotivationItemPage(
  programId: string,
  items: MotivationItem[],
  pagination: { nextPage: number; hasMore: boolean },
  queueGeneration: number
) {
  if (!activeSession || activeSession.programId !== programId) return activeSession;
  if (activeSession.queueGeneration !== queueGeneration) return activeSession;
  const seen = new Set(activeSession.loadedItems.map((item) => item.id));
  const additions = orderMotivationItems(items).filter((item) => {
    const id = String(item.id || "").trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  activeSession = {
    ...activeSession,
    loadedItems: [...activeSession.loadedItems, ...additions],
    nextPage: pagination.nextPage,
    hasMore: pagination.hasMore,
  };
  return activeSession;
}

export function setMotivationActiveItem(itemId: string, index: number) {
  if (!activeSession) return null;
  activeSession = {
    ...activeSession,
    currentItemId: itemId,
    currentItemIndex: index,
  };
  return activeSession;
}

export function bumpMotivationQueueGeneration() {
  if (!activeSession) return 0;
  activeSession = {
    ...activeSession,
    queueGeneration: activeSession.queueGeneration + 1,
    skipFailures: 0,
  };
  return activeSession.queueGeneration;
}
