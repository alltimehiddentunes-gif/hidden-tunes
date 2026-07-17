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
  const loadedItems = orderMotivationItems(input.items);
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
    currentItemIndex: startIndex,
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
  const merged = orderMotivationItems([...activeSession.loadedItems, ...items]);
  activeSession = {
    ...activeSession,
    loadedItems: merged,
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
