"use client";

import { useMemo, useState } from "react";

import {
  type EmotionalSongAnalysisResult,
  suggestionToDraft,
} from "@/lib/emotionalAudioAnalysis";
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
  EMOTIONAL_ANALYSIS_MAX_BATCH,
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

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
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
  const [results, setResults] = useState<EmotionalSongAnalysisResult[]>([]);
  const [drafts, setDrafts] = useState<Record<string, EmotionalMetadataDraft>>({});
  const [applySelection, setApplySelection] = useState<Record<string, boolean>>({});
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const analyzableTracks = useMemo(
    () => tracks.filter((track) => Boolean(track.audioUrl)),
    [tracks]
  );

  const suggestedResults = useMemo(
    () => results.filter((entry) => entry.status === "suggested"),
    [results]
  );

  const selectedCount = selectedIds.length;
  const applyCount = Object.values(applySelection).filter(Boolean).length;

  function toggleTrack(trackId: string) {
    setSelectedIds((current) =>
      current.includes(trackId)
        ? current.filter((id) => id !== trackId)
        : [...current, trackId]
    );
  }

  function selectAllAnalyzable() {
    setSelectedIds(analyzableTracks.map((track) => track.id).slice(0, EMOTIONAL_ANALYSIS_MAX_BATCH));
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  async function analyzeSelected() {
    if (!accessToken) return;

    if (!selectedCount) {
      setErrorMessage("Select at least one track with audio.");
      return;
    }

    if (selectedCount > EMOTIONAL_ANALYSIS_MAX_BATCH) {
      setErrorMessage(
        `Select up to ${EMOTIONAL_ANALYSIS_MAX_BATCH} tracks per analysis batch.`
      );
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage("");
    setStatusMessage("Analyzing audio and generating suggestions...");

    try {
      const response = await fetch("/api/admin/songs/analyze-emotional-metadata", {
        method: "POST",
        headers: {
          ...authHeader(accessToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ songIds: selectedIds }),
      });

      const data = (await response.json().catch(() => null)) as AnalyzeResponse | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Emotional analysis request failed.");
      }

      const nextResults = data.results || [];
      setResults(nextResults);

      const nextDrafts: Record<string, EmotionalMetadataDraft> = {};
      const nextApplySelection: Record<string, boolean> = {};

      nextResults.forEach((result) => {
        nextDrafts[result.songId] = draftFromResult(result);
        nextApplySelection[result.songId] = result.status === "suggested";
      });

      setDrafts(nextDrafts);
      setApplySelection(nextApplySelection);
      setStatusMessage(data.message || "Analysis complete.");
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Emotional analysis failed."
      );
      setStatusMessage("");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function applySelected() {
    if (!accessToken) return;

    const items = suggestedResults
      .filter((result) => applySelection[result.songId])
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
        };
      });

    if (!items.length) {
      setErrorMessage("Select at least one suggested track to apply.");
      return;
    }

    if (items.length > EMOTIONAL_ANALYSIS_MAX_BATCH) {
      setErrorMessage(
        `Apply up to ${EMOTIONAL_ANALYSIS_MAX_BATCH} songs per request.`
      );
      return;
    }

    setIsApplying(true);
    setErrorMessage("");
    setStatusMessage("Applying approved emotional metadata...");

    try {
      const response = await fetch("/api/admin/songs/apply-emotional-analysis", {
        method: "POST",
        headers: {
          ...authHeader(accessToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items }),
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

      setStatusMessage(data.message || "Applied emotional metadata.");
      await onApplied();
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to apply suggestions."
      );
      setStatusMessage("");
    } finally {
      setIsApplying(false);
    }
  }

  const panelDisabled = Boolean(disabled) || isAnalyzing || isApplying;

  return (
    <section className="rounded-[1.7rem] border border-violet-300/20 bg-violet-500/[0.05] p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-200">
            AI-Assisted Emotional Analysis
          </p>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">
            Review before apply
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
            Analyze up to {EMOTIONAL_ANALYSIS_MAX_BATCH} tracks at a time using
            lightweight audio metadata and rule-based taxonomy mapping. Suggestions
            are not saved until you approve and apply them.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={panelDisabled}
            onClick={selectAllAnalyzable}
            className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-black text-white/80 transition hover:border-violet-300/30 disabled:opacity-40"
          >
            Select Up To {EMOTIONAL_ANALYSIS_MAX_BATCH}
          </button>
          <button
            type="button"
            disabled={panelDisabled || !selectedCount}
            onClick={analyzeSelected}
            className="rounded-2xl border border-violet-300/30 bg-violet-400/15 px-4 py-3 text-sm font-black text-violet-50 transition hover:border-violet-300/50 disabled:opacity-40"
          >
            {isAnalyzing ? "Analyzing..." : "Analyze Emotional Metadata"}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-white/45">
        <span className="rounded-full bg-white/[0.06] px-3 py-1">
          Selected: {selectedCount}/{EMOTIONAL_ANALYSIS_MAX_BATCH}
        </span>
        <span className="rounded-full bg-white/[0.06] px-3 py-1">
          Analyzable: {analyzableTracks.length}
        </span>
        <span className="rounded-full bg-white/[0.06] px-3 py-1">
          Suggestions: {suggestedResults.length}
        </span>
        {selectedCount ? (
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
              <span className="min-w-0">
                <span className="block break-words text-sm font-black text-white">
                  {track.title}
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
