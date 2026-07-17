import AsyncStorage from "@react-native-async-storage/async-storage";

const RECENTLY_PLAYED_KEY = "hidden_tunes_educational_recent_v1";
const MAX_RECENT = 24;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EducationalRecentlyPlayedEntry = {
  programId: string;
  programTitle: string;
  programArtwork?: string | null;
  educatorName?: string | null;
  sessionId: string;
  sessionTitle?: string | null;
  playedAt?: number;
};

async function readRecent(): Promise<EducationalRecentlyPlayedEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_PLAYED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EducationalRecentlyPlayedEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRecent(entries: EducationalRecentlyPlayedEntry[]) {
  await AsyncStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(entries.slice(0, MAX_RECENT)));
}

function isValidRecentEntry(entry: EducationalRecentlyPlayedEntry | undefined | null) {
  return Boolean(
    entry &&
      UUID_RE.test(String(entry.programId || "")) &&
      UUID_RE.test(String(entry.sessionId || ""))
  );
}

export async function recordEducationalRecentlyPlayed(entry: EducationalRecentlyPlayedEntry) {
  const programId = String(entry.programId || "").trim();
  const sessionId = String(entry.sessionId || "").trim();
  if (!programId || !sessionId) return;

  const current = await readRecent();
  const next: EducationalRecentlyPlayedEntry = {
    programId,
    programTitle: String(entry.programTitle || "Lecture"),
    programArtwork: entry.programArtwork || null,
    educatorName: entry.educatorName || null,
    sessionId,
    sessionTitle: entry.sessionTitle || null,
    playedAt: Date.now(),
  };

  const deduped = current.filter(
    (item) => !(item.programId === programId && item.sessionId === sessionId)
  );
  await writeRecent([next, ...deduped]);
}

export async function listEducationalRecentlyPlayed(limit = 12) {
  const entries = await readRecent();
  // Home rails key cards by programId. Storage may keep multiple sessions per
  // program; collapse to the newest program occurrence so React keys stay unique.
  const seenProgramIds = new Set<string>();
  const output: EducationalRecentlyPlayedEntry[] = [];

  for (const entry of entries.filter(isValidRecentEntry)) {
    const programId = String(entry.programId || "").trim();
    if (!programId || seenProgramIds.has(programId)) continue;
    seenProgramIds.add(programId);
    output.push(entry);
    if (output.length >= limit) break;
  }

  return output;
}
