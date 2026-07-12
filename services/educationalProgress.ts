import AsyncStorage from "@react-native-async-storage/async-storage";

const PROGRESS_KEY = "hidden_tunes_educational_progress_v1";
const MAX_PROGRESS_ENTRIES = 48;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EducationalProgressEntry = {
  programId: string;
  programTitle: string;
  programArtwork?: string | null;
  educatorName?: string | null;
  sessionId: string;
  sessionTitle?: string | null;
  sequenceNumber?: number | null;
  positionMillis: number;
  durationMillis?: number | null;
  programCompletionPercentage?: number;
  completed?: boolean;
  updatedAt: number;
};

type EducationalProgressStore = Record<string, EducationalProgressEntry>;

async function readStore(): Promise<EducationalProgressStore> {
  try {
    const raw = await AsyncStorage.getItem(PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as EducationalProgressStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStore(store: EducationalProgressStore) {
  await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(store));
}

function isValidProgressEntry(entry: EducationalProgressEntry | undefined | null) {
  return Boolean(
    entry &&
      UUID_RE.test(String(entry.programId || "")) &&
      UUID_RE.test(String(entry.sessionId || "")) &&
      Number.isFinite(Number(entry.updatedAt))
  );
}

export async function loadEducationalProgress(
  programId: string
): Promise<EducationalProgressEntry | null> {
  const cleanProgramId = String(programId || "").trim();
  if (!cleanProgramId) return null;
  const store = await readStore();
  return store[cleanProgramId] || null;
}

export async function saveEducationalProgress(entry: EducationalProgressEntry) {
  const cleanProgramId = String(entry.programId || "").trim();
  const cleanSessionId = String(entry.sessionId || "").trim();
  if (!cleanProgramId || !cleanSessionId) return null;

  const store = await readStore();
  const existing = store[cleanProgramId];
  const nextUpdatedAt = Math.max(entry.updatedAt || Date.now(), Date.now());

  if (existing && existing.updatedAt > nextUpdatedAt) {
    return existing;
  }

  const next: EducationalProgressEntry = {
    programId: cleanProgramId,
    programTitle: String(entry.programTitle || "Lecture"),
    programArtwork: entry.programArtwork || null,
    educatorName: entry.educatorName || null,
    sessionId: cleanSessionId,
    sessionTitle: entry.sessionTitle || null,
    sequenceNumber: entry.sequenceNumber ?? null,
    positionMillis: Math.max(0, Math.floor(entry.positionMillis || 0)),
    durationMillis: entry.durationMillis ?? null,
    programCompletionPercentage: Math.max(
      0,
      Math.min(100, Math.round(Number(entry.programCompletionPercentage ?? 0)))
    ),
    completed: entry.completed === true,
    updatedAt: nextUpdatedAt,
  };

  store[cleanProgramId] = next;
  const compacted = Object.fromEntries(
    Object.values(store)
      .filter(isValidProgressEntry)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_PROGRESS_ENTRIES)
      .map((item) => [item.programId, item])
  );
  await writeStore(compacted);
  return next;
}

export async function clearEducationalProgress(programId: string) {
  const cleanProgramId = String(programId || "").trim();
  if (!cleanProgramId) return;
  const store = await readStore();
  if (!store[cleanProgramId]) return;
  delete store[cleanProgramId];
  await writeStore(store);
}

export async function listContinueLearningEntries(limit = 12) {
  const store = await readStore();
  return Object.values(store)
    .filter(isValidProgressEntry)
    .filter(
      (entry) =>
        entry.positionMillis > 0 &&
        entry.completed !== true &&
        Boolean(entry.programId) &&
        Boolean(entry.sessionId)
    )
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, limit);
}
