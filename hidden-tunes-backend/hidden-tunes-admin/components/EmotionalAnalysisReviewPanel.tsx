"use client";

import { useMemo, useRef, useState } from "react";

import {
  type EmotionalSongAnalysisResult,
  suggestionToDraft,
} from "@/lib/emotionalAudioAnalysis";
import {
  createQueueItems,
  EMOTIONAL_ANALYSIS_QUEUE_MAX,
  EMOTIONAL_ANALYSIS_THROTTLE_MS,
  queueStatusClass,
  queueStatusLabel,
  sleep,
  summarizeQueue,
  type EmotionalQueueItem,
} from "@/lib/emotionalAnalysisQueue";
import {
  buildEmotionalRequestBody,
  type EmotionalMetadataDraft,
  validateEmotionalDraft,
} from "@/lib/emotionalMetadata";
import {
  ANALYSIS_SOURCE_OPTIONS,
  ANALYSIS_STATUS_OPTIONS,
  ATMOSPHERE_OPTIONS,
  buildTaxonomySelectOptions,
  EMOTION_OPTIONS,
  INSTRUMENTATION_OPTIONS,
  TEXTURE_OPTIONS,
  TIME_OF_DAY_OPTIONS,
  VOCAL_FEEL_OPTIONS,
} from "@/lib/emotionalTaxonomy";

type ReviewTrack = {
  id: string;
  title: string;
  artist: string;
  mood: string | null;
  genre: string | null;
  audioUrl: string | null;
};

type AnalyzeResponse = {
  success: boolean;
  message?: string;
  error?: string;
  results?: EmotionalSongAnalysisResult[];
};

type ApplyResponse = {
  success: boolean;
  message?: string;
  error?: string;
  applied?: Array<{ songId: string; title: string }>;
  failures?: Array<{ songId: string; error: string }>;
};

const fieldClass =
  "w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm font-semibold text-white outline-none transition placeholder:text-white/25 focus:border-violet-300/40";

/** UI-only selection cap for bulk queues; backend batch size stays at 25. */
const EMOTIONAL_ANALYSIS_UI_SELECTION_MAX = 2000;

const BACKEND_BATCH_SIZE = EMOTIONAL_ANALYSIS_QUEUE_MAX;

type ApplyPayloadItem = {
  songId: string;
  energy?: number | null;
  tempoBpm?: number | null;
  atmosphere?: string | null;
  emotion?: string | null;
  texture?: string | null;
  timeOfDay?: string | null;
  vocalFeel?: string | null;
  instrumentation?: string | null;
  analysisStatus?: string | null;
  analysisSource?: string | null;
};

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items];

  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function draftFromResult(result: EmotionalSongAnalysisResult): EmotionalMetadataDraft {
  if (result.suggestion) {
    return suggestionToDraft(result.suggestion);
  }

  return {
    energy: "",
    tempoBpm: "",
    atmosphere: "",
    emotion: "",
    texture: "",
    timeOfDay: "",
    vocalFeel: "",
    instrumentation: "",
    analysisStatus: result.status === "failed" ? "failed" : "",
    analysisSource: "",
  };
}

function mergeAnalysisResult(
  current: EmotionalSongAnalysisResult[],
  next: EmotionalSongAnalysisResult
) {
  const without = current.filter((entry) => entry.songId !== next.songId);
  return [...without, next];
}

function EmotionalSuggestionEditor({
  draft,
  disabled,
  onChange,
}: {
  draft: EmotionalMetadataDraft;
  disabled: boolean;
  onChange: (patch: Partial<EmotionalMetadataDraft>) => void;
}) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="block min-w-0">
        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">
          Energy (0-100)
        </span>
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          disabled={disabled}
          value={draft.energy}
          onChange={(event) => onChange({ energy: event.target.value })}
          className={`${fieldClass} mt-1`}
        />
      </label>

      <label className="block min-w-0">
        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">
          Tempo BPM
        </span>
        <input
          type="number"
          min={1}
          step={1}
          disabled={disabled}
          value={draft.tempoBpm}
          onChange={(event) => onChange({ tempoBpm: event.target.value })}
          className={`${fieldClass} mt-1`}
        />
      </label>

      <TaxonomySelect
        label="Atmosphere"
        value={draft.atmosphere}
        options={ATMOSPHERE_OPTIONS}
        disabled={disabled}
        onChange={(value) => onChange({ atmosphere: value })}
      />
      <TaxonomySelect
        label="Emotion"
        value={draft.emotion}
        options={EMOTION_OPTIONS}
        disabled={disabled}
        onChange={(value) => onChange({ emotion: value })}
      />
      <TaxonomySelect
        label="Texture"
        value={draft.texture}
        options={TEXTURE_OPTIONS}
        disabled={disabled}
        onChange={(value) => onChange({ texture: value })}
      />
      <TaxonomySelect
        label="Time of day"
        value={draft.timeOfDay}
        options={TIME_OF_DAY_OPTIONS}
        disabled={disabled}
        onChange={(value) => onChange({ timeOfDay: value })}
      />
      <TaxonomySelect
        label="Vocal feel"
        value={draft.vocalFeel}
        options={VOCAL_FEEL_OPTIONS}
        disabled={disabled}
        onChange={(value) => onChange({ vocalFeel: value })}
      />
      <TaxonomySelect
        label="Instrumentation"
        value={draft.instrumentation}
        options={INSTRUMENTATION_OPTIONS}
        disabled={disabled}
        onChange={(value) => onChange({ instrumentation: value })}
      />
      <TaxonomySelect
        label="Analysis status"
        value={draft.analysisStatus}
        options={ANALYSIS_STATUS_OPTIONS}
        disabled={disabled}
        onChange={(value) => onChange({ analysisStatus: value })}
      />
      <TaxonomySelect
        label="Analysis source"
        value={draft.analysisSource}
        options={ANALYSIS_SOURCE_OPTIONS}
        disabled={disabled}
        onChange={(value) => onChange({ analysisSource: value })}
      />
    </div>
  );
}

function TaxonomySelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const selectOptions = buildTaxonomySelectOptions(options, value);

  return (
    <label className="block min-w-0">
      <span className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">
        {label}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`${fieldClass} mt-1 appearance-none`}
      >
        {selectOptions.map((option) => (
          <option key={`${label}-${option.value || "empty"}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function EmotionalAnalysisReviewPanel({
  tracks,
  accessToken,
  disabled,
  onApplied,
}: {
  tracks: ReviewTrack[];
  accessToken: string;
  disabled?: boolean;
  onApplied: () => Promise<void> | void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [queueItems, setQueueItems] = useState<EmotionalQueueItem[]>([]);
  const [results, setResults] = useState<EmotionalSongAnalysisResult[]>([]);
  const [drafts, setDrafts] = useState<Record<string, EmotionalMetadataDraft>>({});
  const [applySelection, setApplySelection] = useState<Record<string, boolean>>({});
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isQueueRunning, setIsQueueRunning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [applyProgress, setApplyProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const cancelQueueRef = useRef(false);

  const trackMap = useMemo(
    () => new Map(tracks.map((track) => [track.id, track])),
    [tracks]
  );

  const analyzableTracks = useMemo(
    () => tracks.filter((track) => Boolean(track.audioUrl)),
    [tracks]
  );

  const suggestedResults = useMemo(
    () => results.filter((entry) => entry.status === "suggested"),
    [results]
  );

  const queueSummary = useMemo(() => summarizeQueue(queueItems), [queueItems]);

  const selectedCount = selectedIds.length;
  const applyCount = Object.values(applySelection).filter(Boolean).length;

  function getQueueStatusForTrack(trackId: string) {
    return queueItems.find((item) => item.songId === trackId)?.status;
  }

  function toggleTrack(trackId: string) {
    if (isQueueRunning) return;

    setSelectedIds((current) =>
      current.includes(trackId)
        ? current.filter((id) => id !== trackId)
        : [...current, trackId]
    );
  }

  function selectAllAnalyzable() {
    if (isQueueRunning) return;

    setSelectedIds(
      analyzableTracks
        .map((track) => track.id)
        .slice(0, EMOTIONAL_ANALYSIS_UI_SELECTION_MAX)
    );
  }

  function clearSelection() {
    if (isQueueRunning) return;

    setSelectedIds([]);
  }

  function upsertQueueItem(songId: string, patch: Partial<EmotionalQueueItem>) {
    setQueueItems((current) =>
      current.map((item) =>
        item.songId === songId ? { ...item, ...patch } : item
      )
    );
  }

  function ingestAnalysisResult(result: EmotionalSongAnalysisResult) {
    setResults((current) => mergeAnalysisResult(current, result));

    setDrafts((current) => ({
      ...current,
      [result.songId]: draftFromResult(result),
    }));

    if (result.status === "suggested") {
      setApplySelection((current) => ({
        ...current,
        [result.songId]: true,
      }));
    }
  }

  async function analyzeOneSong(songId: string) {
    const response = await fetch("/api/admin/songs/analyze-emotional-metadata", {
      method: "POST",
      headers: {
        ...authHeader(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ songIds: [songId] }),
    });

    const data = (await response.json().catch(() => null)) as AnalyzeResponse | null;

    if (!response.ok || !data?.success) {
      throw new Error(data?.error || "Emotional analysis request failed.");
    }

    const result = data.results?.[0];

    if (!result) {
      throw new Error("Analysis response did not include a song result.");
    }

    return result;
  }

  async function analyzeSelectedSongs() {
    if (!accessToken) return;

    if (!selectedCount) {
      setErrorMessage("Select at least one track with audio.");
      return;
    }

    if (selectedCount > EMOTIONAL_ANALYSIS_UI_SELECTION_MAX) {
      setErrorMessage(
        `Select up to ${EMOTIONAL_ANALYSIS_UI_SELECTION_MAX} tracks per bulk queue.`
      );
      return;
    }

    const selectedTracks = selectedIds
      .map((id) => trackMap.get(id))
      .filter((track): track is ReviewTrack => Boolean(track))
      .filter((track) => Boolean(track.audioUrl));

    if (!selectedTracks.length) {
      setErrorMessage("Selected tracks must include audio URLs.");
      return;
    }

    cancelQueueRef.current = false;
    setIsQueueRunning(true);
    setAnalysisProgress({ current: 0, total: selectedTracks.length });
    setErrorMessage("");
    setStatusMessage(
      `Queued ${selectedTracks.length} track(s) in batches of ${BACKEND_BATCH_SIZE}. Processing sequentially...`
    );

    const initialQueue = createQueueItems(
      selectedTracks.map((track) => ({ id: track.id, title: track.title }))
    );

    setQueueItems(initialQueue);

    let completed = 0;
    let failed = 0;
    let processed = 0;
    const trackChunks = chunkArray(selectedTracks, BACKEND_BATCH_SIZE);

    for (const chunk of trackChunks) {
      if (cancelQueueRef.current) {
        break;
      }

      for (const track of chunk) {
        if (cancelQueueRef.current) {
          break;
        }

        upsertQueueItem(track.id, { status: "analyzing", error: undefined });
        setAnalysisProgress({
          current: processed + 1,
          total: selectedTracks.length,
        });
        setStatusMessage(
          `Analyzing ${processed + 1} of ${selectedTracks.length} tracks…`
        );

        try {
          const result = await analyzeOneSong(track.id);

          ingestAnalysisResult(result);

          if (result.status === "suggested") {
            completed += 1;
            upsertQueueItem(track.id, {
              status: "completed",
              result,
              error: undefined,
            });
          } else {
            failed += 1;
            upsertQueueItem(track.id, {
              status: "failed",
              result,
              error: result.error || "Analysis failed.",
            });
          }
        } catch (error: unknown) {
          failed += 1;
          const message =
            error instanceof Error ? error.message : "Emotional analysis failed.";

          const failedResult: EmotionalSongAnalysisResult = {
            songId: track.id,
            title: track.title,
            status: "failed",
            error: message,
            confidence: 0,
            signals: {
              bpm: null,
              durationSeconds: null,
              bitrateKbps: null,
              codec: null,
              moodHint: track.mood,
              genreHint: track.genre,
            },
            suggestion: null,
          };

          ingestAnalysisResult(failedResult);
          upsertQueueItem(track.id, {
            status: "failed",
            result: failedResult,
            error: message,
          });
        }

        processed += 1;
        setAnalysisProgress({
          current: processed,
          total: selectedTracks.length,
        });
        setStatusMessage(
          `Analyzing ${processed} of ${selectedTracks.length} tracks… · ${completed} completed · ${failed} failed`
        );

        const hasMoreInRun =
          processed < selectedTracks.length && !cancelQueueRef.current;

        if (hasMoreInRun) {
          await sleep(EMOTIONAL_ANALYSIS_THROTTLE_MS);
        }
      }
    }

    if (cancelQueueRef.current) {
      setStatusMessage("Analysis queue cancelled.");
    } else {
      setStatusMessage(
        `Queue finished. ${completed} completed, ${failed} failed. Review suggestions before applying.`
      );
    }

    setAnalysisProgress(null);
    setIsQueueRunning(false);
  }

  function cancelQueue() {
    cancelQueueRef.current = true;
    setStatusMessage("Cancelling queue after the current song...");
  }

  function buildApplyItems(
    results: EmotionalSongAnalysisResult[],
    includeSong: (songId: string) => boolean
  ) {
    return results
      .filter(
        (result) =>
          result.status === "suggested" && includeSong(result.songId)
      )
      .map((result) => {
        const draft = drafts[result.songId] || draftFromResult(result);
        const validation = validateEmotionalDraft(draft);

        if (!validation.ok) {
          throw new Error(`${result.title}: ${validation.error}`);
        }

        return {
          songId: result.songId,
          ...buildEmotionalRequestBody({
            ...draft,
            analysisStatus: "approved",
            analysisSource: "admin_approved_auto_audio_v1",
          }),
        } satisfies ApplyPayloadItem;
      });
  }

  async function applyItemsInChunks(items: ApplyPayloadItem[]) {
    if (!accessToken) return;

    const chunks = chunkArray(items, BACKEND_BATCH_SIZE);
    let appliedCount = 0;
    let processedCount = 0;

    setApplyProgress({ current: 0, total: items.length });
    setStatusMessage(`Applying 0 of ${items.length} tracks…`);

    for (const chunk of chunks) {
      const response = await fetch("/api/admin/songs/apply-emotional-analysis", {
        method: "POST",
        headers: {
          ...authHeader(accessToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items: chunk }),
      });

      const data = (await response.json().catch(() => null)) as ApplyResponse | null;

      if (!response.ok || !data?.applied?.length) {
        const failureHint = data?.failures?.length
          ? data.failures.map((entry) => entry.error).join(" ")
          : "";
        throw new Error(
          [data?.error || data?.message || "Apply request failed.", failureHint]
            .filter(Boolean)
            .join(" ")
        );
      }

      appliedCount += data.applied.length;
      processedCount += chunk.length;
      setApplyProgress({ current: processedCount, total: items.length });
      setStatusMessage(
        `Applying ${processedCount} of ${items.length} tracks…`
      );
    }

    setStatusMessage(
      `Applied emotional metadata to ${appliedCount} track${appliedCount === 1 ? "" : "s"}.`
    );
    await onApplied();
  }

  async function applySelected() {
    if (!accessToken) return;

    let items: ApplyPayloadItem[] = [];

    try {
      items = buildApplyItems(
        suggestedResults,
        (songId) => Boolean(applySelection[songId])
      );
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Invalid suggestion draft."
      );
      return;
    }

    if (!items.length) {
      setErrorMessage("Select at least one suggested track to apply.");
      return;
    }

    setIsApplying(true);
    setErrorMessage("");

    try {
      await applyItemsInChunks(items);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to apply suggestions."
      );
      setStatusMessage("");
    } finally {
      setApplyProgress(null);
      setIsApplying(false);
    }
  }

  async function applyAllSuggestions() {
    if (!accessToken) return;

    let items: ApplyPayloadItem[] = [];

    try {
      items = buildApplyItems(suggestedResults, () => true);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Invalid suggestion draft."
      );
      return;
    }

    if (!items.length) {
      setErrorMessage("No suggested tracks are ready to apply.");
      return;
    }

    setIsApplying(true);
    setErrorMessage("");

    try {
      await applyItemsInChunks(items);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to apply all suggestions."
      );
      setStatusMessage("");
    } finally {
      setApplyProgress(null);
      setIsApplying(false);
    }
  }

  const panelDisabled = Boolean(disabled) || isQueueRunning || isApplying;

  return (
    <section className="rounded-[1.7rem] border border-violet-300/20 bg-violet-500/[0.05] p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-200">
            AI-Assisted Emotional Analysis
          </p>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">
            Batch queue · review before apply
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
            Select hundreds or thousands of tracks for bulk analysis. The UI queues
            them in backend-safe batches of {BACKEND_BATCH_SIZE}, analyzes one song
            per request with {EMOTIONAL_ANALYSIS_THROTTLE_MS}ms throttling, and
            applies suggestions in matching {BACKEND_BATCH_SIZE}-song chunks. Nothing
            is saved until you apply approved suggestions.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={panelDisabled}
            onClick={selectAllAnalyzable}
            className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-black text-white/80 transition hover:border-violet-300/30 disabled:opacity-40"
          >
            Select All Analyzable
          </button>
          <button
            type="button"
            disabled={panelDisabled || !selectedCount}
            onClick={analyzeSelectedSongs}
            className="rounded-2xl border border-violet-300/30 bg-violet-400/15 px-4 py-3 text-sm font-black text-violet-50 transition hover:border-violet-300/50 disabled:opacity-40"
          >
            {isQueueRunning ? "Queue Running..." : "Analyze Selected Songs"}
          </button>
          {isQueueRunning ? (
            <button
              type="button"
              onClick={cancelQueue}
              className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-200 transition hover:border-red-400/50"
            >
              Cancel Queue
            </button>
          ) : null}
        </div>
      </div>

      {isQueueRunning && analysisProgress ? (
        <p className="mt-4 text-sm font-black text-violet-100">
          Analyzing {analysisProgress.current} of {analysisProgress.total} tracks…
        </p>
      ) : null}

      {isApplying && applyProgress ? (
        <p className="mt-4 text-sm font-black text-violet-100">
          Applying {applyProgress.current} of {applyProgress.total} tracks…
        </p>
      ) : null}

      {queueItems.length ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-black text-violet-100">Queue progress</p>
            <p className="text-xs font-bold text-white/45">
              {queueSummary.finished}/{queueSummary.total} finished ·{" "}
              {queueSummary.progressPercent}%
            </p>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-300 to-emerald-300 transition-all duration-300"
              style={{ width: `${queueSummary.progressPercent}%` }}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-white/[0.06] px-3 py-1 text-white/55">
              Pending: {queueSummary.pending}
            </span>
            <span className="rounded-full bg-yellow-400/15 px-3 py-1 text-yellow-200">
              Analyzing: {queueSummary.analyzing}
            </span>
            <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-emerald-200">
              Completed: {queueSummary.completed}
            </span>
            <span className="rounded-full bg-red-400/15 px-3 py-1 text-red-200">
              Failed: {queueSummary.failed}
            </span>
          </div>

          <div className="mt-3 grid gap-2">
            {queueItems.map((item) => (
              <div
                key={item.songId}
                className="flex flex-col gap-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="break-words text-sm font-semibold text-white">
                  {item.title}
                </span>
                <span
                  className={`inline-flex w-fit rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-widest ${queueStatusClass(item.status)}`}
                >
                  {queueStatusLabel(item.status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-white/45">
        <span className="rounded-full bg-white/[0.06] px-3 py-1">
          Selected: {selectedCount}
        </span>
        <span className="rounded-full bg-white/[0.06] px-3 py-1">
          Batch size: {BACKEND_BATCH_SIZE}
        </span>
        <span className="rounded-full bg-white/[0.06] px-3 py-1">
          Analyzable: {analyzableTracks.length}
        </span>
        <span className="rounded-full bg-white/[0.06] px-3 py-1">
          Suggestions: {suggestedResults.length}
        </span>
        {selectedCount && !isQueueRunning ? (
          <button
            type="button"
            disabled={panelDisabled}
            onClick={clearSelection}
            className="rounded-full border border-white/10 px-3 py-1 text-white/60 transition hover:text-white"
          >
            Clear selection
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2">
        {tracks.map((track) => {
          const isSelected = selectedIds.includes(track.id);
          const canAnalyze = Boolean(track.audioUrl);
          const queueStatus = getQueueStatusForTrack(track.id);

          return (
            <label
              key={track.id}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition ${
                isSelected
                  ? "border-violet-300/35 bg-violet-400/10"
                  : "border-white/10 bg-black/20"
              } ${!canAnalyze ? "opacity-50" : ""}`}
            >
              <input
                type="checkbox"
                disabled={panelDisabled || !canAnalyze}
                checked={isSelected}
                onChange={() => toggleTrack(track.id)}
                className="mt-1 h-4 w-4 accent-violet-300"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="break-words text-sm font-black text-white">
                    {track.title}
                  </span>
                  {queueStatus ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${queueStatusClass(queueStatus)}`}
                    >
                      {queueStatusLabel(queueStatus)}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block break-words text-xs text-white/45">
                  {track.artist}
                  {track.genre ? ` · ${track.genre}` : ""}
                  {track.mood ? ` · ${track.mood}` : ""}
                  {!canAnalyze ? " · Missing audio URL" : ""}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {results.length ? (
        <div className="mt-5 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-black text-violet-100">
              Suggested metadata review
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={panelDisabled || !applyCount}
                onClick={applySelected}
                className="rounded-2xl bg-violet-300 px-4 py-3 text-sm font-black text-black transition hover:scale-[1.01] disabled:opacity-40"
              >
                {isApplying
                  ? "Applying..."
                  : `Apply To ${applyCount} Selected Song${applyCount === 1 ? "" : "s"}`}
              </button>
              <button
                type="button"
                disabled={panelDisabled || !suggestedResults.length}
                onClick={applyAllSuggestions}
                className="rounded-2xl border border-violet-300/30 bg-violet-400/15 px-4 py-3 text-sm font-black text-violet-50 transition hover:border-violet-300/50 disabled:opacity-40"
              >
                {isApplying
                  ? "Applying All..."
                  : `Apply All (${suggestedResults.length})`}
              </button>
            </div>
          </div>

          {results.map((result) => {
            const draft = drafts[result.songId] || draftFromResult(result);

            return (
              <article
                key={result.songId}
                className="rounded-2xl border border-white/10 bg-black/25 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words text-lg font-black text-white">
                      {result.title}
                    </p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-widest text-white/40">
                      {result.status === "suggested"
                        ? `Suggested · ${Math.round(result.confidence * 100)}% confidence`
                        : "Failed"}
                    </p>
                    {result.error ? (
                      <p className="mt-2 text-sm text-red-200">{result.error}</p>
                    ) : null}
                    {result.signals ? (
                      <p className="mt-2 text-xs text-white/45">
                        BPM {result.signals.bpm ?? "—"} · Energy source BPM/bitrate/mood
                        {result.signals.bitrateKbps
                          ? ` · ${result.signals.bitrateKbps} kbps`
                          : ""}
                      </p>
                    ) : null}
                  </div>

                  {result.status === "suggested" ? (
                    <label className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-violet-100">
                      <input
                        type="checkbox"
                        disabled={panelDisabled}
                        checked={Boolean(applySelection[result.songId])}
                        onChange={(event) =>
                          setApplySelection((current) => ({
                            ...current,
                            [result.songId]: event.target.checked,
                          }))
                        }
                        className="h-4 w-4 accent-violet-300"
                      />
                      Apply this song
                    </label>
                  ) : null}
                </div>

                {result.status === "suggested" ? (
                  <EmotionalSuggestionEditor
                    draft={draft}
                    disabled={panelDisabled}
                    onChange={(patch) =>
                      setDrafts((current) => ({
                        ...current,
                        [result.songId]: {
                          ...draft,
                          ...patch,
                        },
                      }))
                    }
                  />
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      {statusMessage ? (
        <p className="mt-4 text-sm font-semibold text-emerald-200">{statusMessage}</p>
      ) : null}
      {errorMessage ? (
        <p className="mt-4 text-sm font-semibold text-red-200">{errorMessage}</p>
      ) : null}
    </section>
  );
}
