const BASE_URL =
  process.env.LECTURE_VERIFY_BASE_URL ||
  process.env.NEXT_PUBLIC_ADMIN_BASE_URL ||
  "https://admin.hiddentunes.com";

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { response, body };
}

const PROGRAM_CATEGORY_ORDER = [
  "academic-lectures",
  "business",
  "language-learning",
  "study-skills",
  "programming",
  "tutorials",
  "design",
  "entrepreneurship",
];

async function listPrograms(limit = 40) {
  const seen = new Set();
  const lectures = [];

  for (const slug of PROGRAM_CATEGORY_ORDER) {
    const { body } = await fetchJson(
      `${BASE_URL}/api/lectures/category/${encodeURIComponent(slug)}?page=1&limit=${limit}`
    );
    const rows = Array.isArray(body.lectures) ? body.lectures : [];
    for (const row of rows) {
      const programId = String(row.id || "").trim();
      if (!programId || seen.has(programId)) continue;
      seen.add(programId);
      lectures.push(row);
    }
    if (lectures.length >= limit) break;
  }

  return lectures;
}

async function loadProgramLessons(programId) {
  const pages = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 5) {
    const { body } = await fetchJson(
      `${BASE_URL}/api/lectures/items/${encodeURIComponent(programId)}?page=${page}&limit=40`
    );
    const lessons = Array.isArray(body.lessons) ? body.lessons : [];
    pages.push(...lessons);
    const pagination = body.pagination || {};
    hasMore = pagination.hasMore === true;
    page += 1;
    if (!lessons.length) break;
  }

  return pages;
}

async function resolveLesson(programId, lessonId) {
  const url = `${BASE_URL}/api/lectures/items/${encodeURIComponent(programId)}/play?lessonId=${encodeURIComponent(lessonId)}`;
  const { response, body } = await fetchJson(url);
  const media = body.media || {};
  const returnedLessonId = String(media.id || "").trim() || null;
  const audioUrl = String(media.audio_url || body.audio_url || "").trim();
  const videoUrl = String(media.video_url || body.video_url || "").trim();
  const mediaType = audioUrl ? "audio" : videoUrl ? "video" : null;

  return {
    programId,
    requestedLessonId: lessonId,
    returnedLessonId,
    mediaType,
    httpStatus: response.status,
    correctLesson: response.ok && returnedLessonId === lessonId,
    error: response.ok ? undefined : String(body.error || response.statusText || "request failed"),
  };
}

function pickLessonIndexes(total) {
  if (total < 5) return Array.from({ length: total }, (_, index) => index);
  const middle = Math.floor(total / 2);
  return [0, 1, middle, total - 2, total - 1];
}

async function main() {
  const programs = await listPrograms(40);
  const candidates = [];

  for (const program of programs) {
    const programId = String(program.id || "").trim();
    if (!programId) continue;
    const lessons = await loadProgramLessons(programId);
    if (lessons.length >= 5) {
      candidates.push({
        id: programId,
        title: String(program.title || programId),
        lessons,
      });
    }
    if (candidates.length >= 5) break;
  }

  const results = [];

  for (const program of candidates.slice(0, 5)) {
    const indexes = pickLessonIndexes(program.lessons.length);
    for (const index of indexes) {
      const lesson = program.lessons[index];
      const lessonId = String(lesson.id || "").trim();
      if (!lessonId) continue;
      results.push(await resolveLesson(program.id, lessonId));
    }
  }

  const summary = {
    base_url: BASE_URL,
    programs_tested: candidates.slice(0, 5).map((program) => ({
      id: program.id,
      title: program.title,
      lesson_count: program.lessons.length,
    })),
    resolves_attempted: results.length,
    resolves_correct: results.filter((row) => row.correctLesson).length,
    resolves_failed: results.filter((row) => !row.correctLesson).length,
    results,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (results.length < 25) {
    console.error(`Expected at least 25 lesson resolves, got ${results.length}.`);
    process.exitCode = 2;
    return;
  }

  if (summary.resolves_failed > 0) {
    process.exitCode = 1;
  }
}

void main();
