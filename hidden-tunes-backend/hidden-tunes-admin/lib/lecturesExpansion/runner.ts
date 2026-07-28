import {
  appendLectureExpansionBatchReport,
  createLectureExpansionState,
  isTaskExhausted,
  loadLectureExpansionState,
  markTaskExhausted,
  writeLectureExpansionState,
  type LectureExpansionState,
} from "@/lib/lecturesExpansion/checkpoint";
import {
  LECTURE_EXPANSION_DEFAULT_BATCH_SIZE,
  LECTURE_EXPANSION_DEFAULT_SOURCE_CONCURRENCY,
  LECTURE_EXPANSION_TARGET_PLAYABLE_ITEMS,
  LECTURE_EXPANSION_TARGET_PROGRAMS,
} from "@/lib/lecturesExpansion/constants";
import { runLectureExpansionBatch } from "@/lib/lecturesExpansion/batch";
import {
  flattenSourceQueryTasks,
  listEnabledLectureSources,
  type LectureSourceDefinition,
} from "@/lib/lecturesExpansion/sourceRegistry";
import {
  getLectureExpansionCounts,
  isLectureExpansionTargetMet,
} from "@/lib/lecturesExpansion/status";

export type LectureExpansionRunOptions = {
  target_programs?: number;
  target_items?: number;
  batch_size?: number;
  max_batches?: number;
  concurrency?: number;
  parallel?: number;
  resume?: boolean;
  source?: string;
  all_sources?: boolean;
  dry_run?: boolean;
  admin_root: string;
};

export type LectureExpansionLoopResult = {
  success: boolean;
  status: "completed" | "partial" | "source_exhausted" | "failed";
  batches_completed: number;
  target_met: boolean;
  all_sources_exhausted: boolean;
  final_counts: Awaited<ReturnType<typeof getLectureExpansionCounts>>;
  reports: Awaited<ReturnType<typeof runLectureExpansionBatch>>[];
};

type PickedTask = {
  source: LectureSourceDefinition;
  task: {
    source_key: string;
    query_family: string;
    subject_family: string;
    region: string;
    wave: number;
  };
};

function taskKey(sourceKey: string, queryFamily: string) {
  return `${sourceKey}::${queryFamily}`;
}

function listAvailableTasks(state: LectureExpansionState, sourceKey?: string | null): PickedTask[] {
  const sources = sourceKey
    ? listEnabledLectureSources(sourceKey)
    : listEnabledLectureSources().filter((entry) => !state.exhausted_sources.includes(entry.source_key));

  if (sources.length === 0) return [];

  return sources.flatMap((source) =>
    flattenSourceQueryTasks(source)
      .filter((task) => !isTaskExhausted(state, task.source_key, task.query_family))
      .map((task) => ({ source, task }))
  );
}

function pickNextTasks(
  state: LectureExpansionState,
  sourceKey: string | null | undefined,
  count: number
): PickedTask[] {
  const allTasks = listAvailableTasks(state, sourceKey);
  if (allTasks.length === 0) {
    const sources = sourceKey
      ? listEnabledLectureSources(sourceKey)
      : listEnabledLectureSources().filter((entry) => !state.exhausted_sources.includes(entry.source_key));
    for (const source of sources) {
      if (!state.exhausted_sources.includes(source.source_key)) {
        state.exhausted_sources.push(source.source_key);
      }
    }
    return [];
  }

  const picked: PickedTask[] = [];
  const used = new Set<string>();
  for (let offset = 0; offset < allTasks.length && picked.length < count; offset += 1) {
    const index = (state.batch_number + offset) % allTasks.length;
    const candidate = allTasks[index];
    const key = taskKey(candidate.task.source_key, candidate.task.query_family);
    if (used.has(key)) continue;
    used.add(key);
    picked.push(candidate);
  }
  return picked;
}

export async function runLectureExpansionLoop(
  options: LectureExpansionRunOptions
): Promise<LectureExpansionLoopResult> {
  const targets = {
    programs: Math.max(1, Number(options.target_programs || LECTURE_EXPANSION_TARGET_PROGRAMS)),
    playable_items: Math.max(1, Number(options.target_items || LECTURE_EXPANSION_TARGET_PLAYABLE_ITEMS)),
  };
  const maxBatches = Math.max(1, Number(options.max_batches || 10_000));
  const batchSize = Math.max(1, Number(options.batch_size || LECTURE_EXPANSION_DEFAULT_BATCH_SIZE));
  const parallel = Math.max(
    1,
    Math.min(4, Number(options.parallel || LECTURE_EXPANSION_DEFAULT_SOURCE_CONCURRENCY))
  );

  let state =
    options.resume !== false ? loadLectureExpansionState(options.admin_root) : null;
  if (!state) state = createLectureExpansionState(targets);
  state.targets = targets;

  const reports: Awaited<ReturnType<typeof runLectureExpansionBatch>>[] = [];
  let allSourcesExhausted = false;
  let batchesCompleted = 0;

  while (batchesCompleted < maxBatches) {
    const counts = await getLectureExpansionCounts({ light: true });
    if (isLectureExpansionTargetMet(counts)) {
      state.status = "completed";
      break;
    }

    const remainingSlots = maxBatches - batchesCompleted;
    const wave = pickNextTasks(state, options.source || null, Math.min(parallel, remainingSlots));
    if (wave.length === 0) {
      allSourcesExhausted = true;
      state.status = "source_exhausted";
      break;
    }

    const assigned = wave.map((next) => {
      state.batch_number += 1;
      return { next, batchNumber: state.batch_number };
    });

    state.last_source_key = assigned[assigned.length - 1]?.next.source.source_key || null;
    state.last_query_family = assigned[assigned.length - 1]?.next.task.query_family || null;

    const perWorkerConcurrency = Math.max(
      4,
      Math.floor(Number(options.concurrency || 24) / Math.max(1, assigned.length))
    );

    const waveReports = await Promise.all(
      assigned.map(({ next, batchNumber }) =>
        runLectureExpansionBatch(
          {
            source: next.source,
            query_family: next.task.query_family,
            batch_size: batchSize,
            dry_run: options.dry_run,
            resume: options.resume !== false,
            probe_concurrency: perWorkerConcurrency,
          },
          batchNumber
        ).then((report) => ({ next, report }))
      )
    );

    for (const { next, report } of waveReports) {
      reports.push(report);
      batchesCompleted += 1;
      state.last_batch_summary = report;
      state.updated_at = new Date().toISOString();
      appendLectureExpansionBatchReport(options.admin_root, report.batch_number, report);

      if (report.page_empty || report.status === "failed") {
        markTaskExhausted(state, next.source.source_key, next.task.query_family);
      }
    }

    writeLectureExpansionState(state, options.admin_root);

    const remainingTasks = listAvailableTasks(state, options.source || null);
    if (remainingTasks.length === 0) {
      allSourcesExhausted = true;
      state.status = "source_exhausted";
      break;
    }
  }

  const finalCounts = await getLectureExpansionCounts({ light: true });
  const targetMet = isLectureExpansionTargetMet(finalCounts);
  if (targetMet) state.status = "completed";
  writeLectureExpansionState(state, options.admin_root);

  return {
    success: targetMet || reports.some((report) => report.status === "completed"),
    status: targetMet ? "completed" : allSourcesExhausted ? "source_exhausted" : "partial",
    batches_completed: reports.length,
    target_met: targetMet,
    all_sources_exhausted: allSourcesExhausted,
    final_counts: finalCounts,
    reports,
  };
}
