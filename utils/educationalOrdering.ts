import type { EducationalSession } from "@/types/education";

function cleanText(value: unknown, max = 500) {
  return String(value || "").trim().slice(0, max);
}

export function findEducationalSessionIndex(sessions: EducationalSession[], sessionId: string) {
  const cleanId = cleanText(sessionId);
  if (!cleanId) return -1;
  return sessions.findIndex((session) => session.id === cleanId);
}

export function assertUniqueEducationalSessions(sessions: EducationalSession[]) {
  const seen = new Set<string>();
  for (const session of sessions) {
    const id = cleanText(session.id);
    if (!id || seen.has(id)) {
      throw new Error("Educational queue contains duplicate session IDs.");
    }
    seen.add(id);
  }
}

export function mergeEducationalSessions(
  existing: EducationalSession[],
  incoming: EducationalSession[]
) {
  const map = new Map<string, EducationalSession>();
  for (const session of existing) {
    const id = cleanText(session.id);
    if (id) map.set(id, session);
  }
  for (const session of incoming) {
    const id = cleanText(session.id);
    if (id) map.set(id, session);
  }
  const merged = orderEducationalSessions([...map.values()]);
  assertUniqueEducationalSessions(merged);
  return merged;
}

function sessionSortKey(
  session: Pick<
    EducationalSession,
    "moduleNumber" | "sequenceNumber" | "lessonNumber" | "publishedAt" | "title" | "id"
  >
) {
  return {
    module: Number(session.moduleNumber ?? 0),
    sequence: Number(session.sequenceNumber ?? 0),
    lesson: Number(session.lessonNumber ?? session.sequenceNumber ?? 0),
    published: cleanText(session.publishedAt, 40),
    title: cleanText(session.title).toLowerCase(),
    id: cleanText(session.id),
  };
}

/** Single canonical ordering for display, queue, resume, and auto-advance. */
export function compareEducationalSessions(
  left: Pick<
    EducationalSession,
    "moduleNumber" | "sequenceNumber" | "lessonNumber" | "publishedAt" | "title" | "id"
  >,
  right: Pick<
    EducationalSession,
    "moduleNumber" | "sequenceNumber" | "lessonNumber" | "publishedAt" | "title" | "id"
  >
) {
  const a = sessionSortKey(left);
  const b = sessionSortKey(right);

  if (a.module !== b.module) return a.module - b.module;
  if (a.lesson !== b.lesson) return a.lesson - b.lesson;
  if (a.sequence !== b.sequence) return a.sequence - b.sequence;
  if (a.published !== b.published) return a.published > b.published ? -1 : 1;
  if (a.title !== b.title) return a.title.localeCompare(b.title);
  return a.id.localeCompare(b.id);
}

export function orderEducationalSessions<T extends EducationalSession>(
  sessions: T[],
  anchorSessionId?: string | null
) {
  const deduped = new Map<string, T>();
  for (const session of sessions) {
    const id = cleanText(session.id);
    if (!id || deduped.has(id)) continue;
    deduped.set(id, session);
  }

  const ordered = [...deduped.values()].sort(compareEducationalSessions);

  if (!anchorSessionId) {
    return ordered.map((session, index) => ({
      ...session,
      sequenceNumber: index + 1,
    }));
  }

  const anchorIndex = ordered.findIndex((session) => session.id === anchorSessionId);
  if (anchorIndex <= 0) {
    return ordered.map((session, index) => ({
      ...session,
      sequenceNumber: index + 1,
    }));
  }

  const anchor = ordered[anchorIndex];
  const rest = ordered.filter((session) => session.id !== anchorSessionId);
  return [anchor, ...rest].map((session, index) => ({
    ...session,
    sequenceNumber: index + 1,
  }));
}

export function paginateEducationalSessions<T>(sessions: T[], page: number, limit = 40) {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(40, Math.max(1, limit));
  const start = (safePage - 1) * safeLimit;
  const slice = sessions.slice(start, start + safeLimit);
  const total = sessions.length;
  const totalPages = total > 0 ? Math.ceil(total / safeLimit) : 0;

  return {
    sessions: slice,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
      hasMore: safePage < totalPages,
    },
  };
}
