"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import AdminShell from "@/components/AdminShell";
import { getActiveUploaderSession, supabase } from "@/lib/auth";
import { INTERLUDE_PRESETS } from "@/lib/syncedLyricsTypes";
import type { SyncedLyricLineType } from "@/lib/syncedLyricsTypes";
import {
  applyEvenTimestampMode,
  applySmartSpacingHelper,
  buildSyncedPayload,
  inferLineType,
  mergePlainAndSyncedLines,
  secondsToLrcTimestamp,
  splitPlainLyricLines,
} from "@/lib/syncedLyricsUtils";

type SyncLine = {
  id: string;
  text: string;
  timeMs: number | null;
  type: SyncedLyricLineType;
};

type ApiResponse = {
  success: boolean;
  error?: string;
  message?: string;
  release?: { id: string; title: string; artworkUrl: string | null } | null;
  track?: {
    id: string;
    releaseId: string | null;
    title: string;
    artworkUrl: string | null;
    audioUrl: string | null;
  };
  syncedLyrics?: {
    lyricsJson: Array<{ time: number; text: string; type: SyncedLyricLineType }>;
    lyricsLrc: string;
    plainLyrics: string;
    version: number;
  };
};

const AUTOSAVE_MS = 1600;
const SEEK_STEP_MS = 3000;

function getParamId(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function msToLrcTimestamp(ms: number) {
  const safeMs = Math.max(0, Math.round(ms));
  const minutes = Math.floor(safeMs / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const centiseconds = Math.floor((safeMs % 1000) / 10);
  return `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}]`;
}

function formatClock(ms: number | null) {
  if (ms === null || Number.isNaN(ms)) return "--:--.--";
  return msToLrcTimestamp(ms).replace(/^\[|\]$/g, "");
}

function linesToSyncedJson(lines: SyncLine[]) {
  return lines
    .filter((line) => line.text.trim() && line.timeMs !== null)
    .sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0))
    .map((line) => ({
      time: Math.round((line.timeMs || 0) / 10) / 100,
      text: line.text.trim(),
      type: line.type,
    }));
}

function buildEditorLines(plainLyrics: string, lyricsJson: ApiResponse["syncedLyrics"]) {
  const merged = mergePlainAndSyncedLines(
    plainLyrics,
    (lyricsJson?.lyricsJson || []).map((line) => ({
      ...line,
      time: line.time,
    }))
  );

  return merged.map((line, index) => ({
    id: `line-${index}`,
    text: line.text,
    timeMs: line.time > 0 ? Math.round(line.time * 1000) : null,
    type: line.type,
  }));
}

function findActiveLineIndex(lines: SyncLine[], positionMs: number) {
  const timed = lines
    .map((line, index) => ({ index, timeMs: line.timeMs }))
    .filter((line) => line.timeMs !== null) as Array<{ index: number; timeMs: number }>;

  if (!timed.length) return -1;

  let answer = timed[0].index;
  timed.forEach((line) => {
    if (positionMs >= line.timeMs) answer = line.index;
  });
  return answer;
}

function serializeSnapshot(lines: SyncLine[], plainLyrics: string) {
  const payload = buildSyncedPayload(linesToSyncedJson(lines), plainLyrics);
  return JSON.stringify(payload);
}

export default function PremiumSyncedLyricsEditorPage() {
  const router = useRouter();
  const params = useParams<{ id?: string | string[]; trackId?: string | string[] }>();
  const releaseId = getParamId(params.id);
  const trackId = getParamId(params.trackId);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedSnapshotRef = useRef("");
  const keyboardEnabledRef = useRef(true);

  const [accessToken, setAccessToken] = useState("");
  const [releaseTitle, setReleaseTitle] = useState("Release");
  const [trackTitle, setTrackTitle] = useState("Track");
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [plainLyrics, setPlainLyrics] = useState("");
  const [lines, setLines] = useState<SyncLine[]>([]);
  const [version, setVersion] = useState(0);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [playbackMs, setPlaybackMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(true);

  const syncedPayload = useMemo(
    () => buildSyncedPayload(linesToSyncedJson(lines), plainLyrics),
    [lines, plainLyrics]
  );

  const isDirty = useMemo(
    () => serializeSnapshot(lines, plainLyrics) !== savedSnapshotRef.current,
    [lines, plainLyrics]
  );

  const syncedCount = useMemo(
    () => lines.filter((line) => line.timeMs !== null).length,
    [lines]
  );

  const currentLine = lines[currentLineIndex] || null;
  const activeLineIndex = findActiveLineIndex(lines, playbackMs);

  const loadEditor = useCallback(
    async (token: string) => {
      const response = await fetch(`/api/admin/tracks/${trackId}/synced-lyrics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json().catch(() => null)) as ApiResponse | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Premium synced lyrics editor could not load.");
      }

      const loadedPlain = data.syncedLyrics?.plainLyrics || "";
      const nextLines = buildEditorLines(loadedPlain, data.syncedLyrics);

      setReleaseTitle(data.release?.title || "Release");
      setTrackTitle(data.track?.title || "Track");
      setArtworkUrl(data.track?.artworkUrl || data.release?.artworkUrl || null);
      setAudioUrl(data.track?.audioUrl || null);
      setPlainLyrics(loadedPlain);
      setLines(nextLines);
      setVersion(data.syncedLyrics?.version || 0);
      savedSnapshotRef.current = serializeSnapshot(nextLines, loadedPlain);
      setStatusMessage(
        data.syncedLyrics?.lyricsLrc
          ? "Loaded premium synced lyrics."
          : "Ready to stamp lyric timestamps."
      );
    },
    [trackId]
  );

  useEffect(() => {
    async function boot() {
      try {
        const { profile } = await getActiveUploaderSession();
        if (!profile) {
          router.replace("/admin/login");
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token || "";
        if (!token) {
          router.replace("/admin/login");
          return;
        }

        setAccessToken(token);
        await loadEditor(token);
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error ? error.message : "Premium synced lyrics editor could not load."
        );
      } finally {
        setIsLoading(false);
      }
    }

    void boot();
  }, [loadEditor, router]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const persist = useCallback(
    async (silent = false) => {
      if (!accessToken) {
        router.replace("/admin/login");
        return false;
      }

      if (!syncedPayload.lyricsJson.length && !plainLyrics.trim()) {
        if (!silent) setErrorMessage("Add lyric lines before saving.");
        return false;
      }

      setIsSaving(true);
      setErrorMessage("");

      try {
        const response = await fetch(`/api/admin/tracks/${trackId}/synced-lyrics`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            plainLyrics: syncedPayload.plainLyrics,
            lyricsJson: syncedPayload.lyricsJson,
            lyricsLrc: syncedPayload.lyricsLrc,
          }),
        });

        const data = (await response.json().catch(() => null)) as ApiResponse | null;
        if (!response.ok || !data?.success) {
          throw new Error(data?.error || "Synced lyrics could not be saved.");
        }

        if (data.syncedLyrics?.version) setVersion(data.syncedLyrics.version);
        savedSnapshotRef.current = serializeSnapshot(lines, plainLyrics);
        if (!silent) setStatusMessage(data.message || "Synced lyrics saved.");
        return true;
      } catch (error: unknown) {
        if (!silent) {
          setErrorMessage(
            error instanceof Error ? error.message : "Synced lyrics could not be saved."
          );
        }
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [accessToken, lines, plainLyrics, router, syncedPayload, trackId]
  );

  useEffect(() => {
    if (!isDirty || isLoading || isSaving) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void persist(true);
    }, AUTOSAVE_MS);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [isDirty, isLoading, isSaving, persist]);

  const rebuildLines = useCallback((nextPlain: string) => {
    setLines((current) => {
      const plainLines = splitPlainLyricLines(nextPlain);
      const syncedMap = new Map(
        current.filter((line) => line.timeMs !== null).map((line) => [line.text, line] as const)
      );

      return plainLines.map((text, index) => {
        const existing = syncedMap.get(text) || current[index];
        return {
          id: existing?.id || `line-${index}`,
          text,
          timeMs: existing?.timeMs ?? null,
          type: existing?.type || inferLineType(text),
        };
      });
    });
  }, []);

  const updateLineTime = useCallback((index: number, timeMs: number | null) => {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, timeMs } : line
      )
    );
  }, []);

  const stampCurrentLine = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const markedMs = Math.max(0, Math.round(audio.currentTime * 1000));
    updateLineTime(currentLineIndex, markedMs);
    setStatusMessage(`Stamped line ${currentLineIndex + 1} at ${formatClock(markedMs)}.`);
  }, [currentLineIndex, updateLineTime]);

  const skipLine = useCallback(() => {
    setCurrentLineIndex((index) => Math.min(lines.length - 1, index + 1));
  }, [lines.length]);

  const undoStamp = useCallback(() => {
    for (let index = currentLineIndex; index >= 0; index -= 1) {
      if (lines[index]?.timeMs !== null) {
        updateLineTime(index, null);
        setCurrentLineIndex(index);
        setStatusMessage(`Cleared timestamp on line ${index + 1}.`);
        return;
      }
    }
    setStatusMessage("No timestamp to undo.");
  }, [currentLineIndex, lines, updateLineTime]);

  const seekBy = useCallback(
    (deltaMs: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const nextMs = Math.max(
        0,
        Math.min(durationMs || audio.duration * 1000, audio.currentTime * 1000 + deltaMs)
      );
      audio.currentTime = nextMs / 1000;
      setPlaybackMs(nextMs);
    },
    [durationMs]
  );

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setErrorMessage("Audio playback could not start.");
      }
      return;
    }

    audio.pause();
    setIsPlaying(false);
  }, []);

  const insertInterlude = useCallback(
    (text: string, type: SyncedLyricLineType) => {
      setLines((current) => {
        const next = [...current];
        next.splice(currentLineIndex + 1, 0, {
          id: `line-${Date.now()}`,
          text,
          timeMs: null,
          type,
        });
        return next;
      });
      setPlainLyrics((current) => {
        const rows = splitPlainLyricLines(current);
        rows.splice(currentLineIndex + 1, 0, text);
        return rows.join("\n");
      });
      setCurrentLineIndex((index) => index + 1);
    },
    [currentLineIndex]
  );

  const applyEvenMode = useCallback(() => {
    const durationSec =
      (durationMs || (audioRef.current?.duration || 0) * 1000 || 0) / 1000;
    if (!durationSec) {
      setErrorMessage("Load track audio before using even timestamp mode.");
      return;
    }

    const next = applyEvenTimestampMode(
      lines.map((line) => ({
        time: (line.timeMs || 0) / 1000,
        text: line.text,
        type: line.type,
      })),
      durationSec
    );

    setLines((current) =>
      current.map((line, index) => ({
        ...line,
        timeMs: Math.round((next[index]?.time || 0) * 1000),
      }))
    );
    setStatusMessage("Even timestamps applied.");
  }, [durationMs, lines]);

  const applySmartSpacing = useCallback(() => {
    const durationSec =
      (durationMs || (audioRef.current?.duration || 0) * 1000 || 0) / 1000;
    if (!durationSec) {
      setErrorMessage("Load track audio before using smart spacing.");
      return;
    }

    const next = applySmartSpacingHelper(
      lines.map((line) => ({
        time: (line.timeMs || 0) / 1000,
        text: line.text,
        type: line.type,
      })),
      durationSec
    );

    setLines((current) =>
      current.map((line, index) => ({
        ...line,
        timeMs: Math.round((next[index]?.time || 0) * 1000),
      }))
    );
    setStatusMessage("Smart spacing applied.");
  }, [durationMs, lines]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!keyboardEnabledRef.current) return;
      const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "textarea" || tag === "input") return;

      if (event.code === "Space") {
        event.preventDefault();
        if (event.shiftKey) void togglePlayback();
        else stampCurrentLine();
      } else if (event.code === "Enter") {
        event.preventDefault();
        skipLine();
      } else if (event.code === "Backspace") {
        event.preventDefault();
        undoStamp();
      } else if (event.code === "ArrowLeft") {
        event.preventDefault();
        seekBy(-SEEK_STEP_MS);
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        seekBy(SEEK_STEP_MS);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [seekBy, skipLine, stampCurrentLine, togglePlayback, undoStamp]);

  function handleBack() {
    if (isDirty) {
      const ok = window.confirm("You have unsaved changes. Leave without saving?");
      if (!ok) return;
    }
    router.push(`/admin/releases/${releaseId}`);
  }

  return (
    <AdminShell
      title="Premium Synced Lyrics"
      description="Cinematic sync workspace with JSON + LRC export, keyboard controls, and autosave."
      actions={
        <EditorActions
          onBack={handleBack}
          onSave={() => void persist(false)}
          isSaving={isSaving}
          isDirty={isDirty}
          isLoading={isLoading}
        />
      }
    >
      {statusMessage ? <Notice tone="success" message={statusMessage} /> : null}
      {errorMessage ? <Notice tone="error" message={errorMessage} /> : null}

      <section className="mt-4 grid gap-5 xl:grid-cols-[360px_1fr]">
        <aside className="flex flex-col gap-5">
          <HeroCard
            artworkUrl={artworkUrl}
            releaseTitle={releaseTitle}
            trackTitle={trackTitle}
            isLoading={isLoading}
          />
          <StatsPanel
            syncedCount={syncedCount}
            totalLines={lines.length}
            playback={formatClock(playbackMs)}
            version={version}
            isDirty={isDirty}
            isSaving={isSaving}
            isLoading={isLoading}
          />
          <PlaybackPanel
            audioRef={audioRef}
            waveformRef={waveformRef}
            audioUrl={audioUrl}
            isPlaying={isPlaying}
            playbackMs={playbackMs}
            durationMs={durationMs}
            isLoading={isLoading}
            onToggle={() => void togglePlayback()}
            onSeek={(ms) => {
              const audio = audioRef.current;
              if (!audio) return;
              audio.currentTime = ms / 1000;
              setPlaybackMs(ms);
            }}
            onLoaded={(ms) => setDurationMs(ms)}
            onTimeUpdate={setPlaybackMs}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
          <AutoModePanel
            onEven={applyEvenMode}
            onSmart={applySmartSpacing}
            disabled={isLoading || !lines.length}
          />
          {showShortcuts ? (
            <ShortcutPanel onHide={() => setShowShortcuts(false)} />
          ) : null}
        </aside>

        <section className="rounded-[2rem] border border-white/10 bg-[#0b0b12]/95 p-5 shadow-2xl backdrop-blur-xl">
          {isLoading ? (
            <div className="h-[720px] animate-pulse rounded-[1.5rem] bg-white/[0.05]" />
          ) : (
            <>
              <header className="border-b border-white/10 pb-5">
                <p className="text-xs font-black uppercase tracking-[0.32em] text-violet-300">
                  Premium Sync Workspace
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">
                  Timestamp every lyric moment
                </h2>
              </header>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="text-xs font-black uppercase tracking-[0.28em] text-white/40">
                    Lyric Source
                  </label>
                  <textarea
                    value={plainLyrics}
                    onChange={(event) => {
                      setPlainLyrics(event.target.value);
                      rebuildLines(event.target.value);
                    }}
                    onFocus={() => {
                      keyboardEnabledRef.current = false;
                    }}
                    onBlur={() => {
                      keyboardEnabledRef.current = true;
                    }}
                    rows={14}
                    className="mt-3 w-full rounded-[1.4rem] border border-white/10 bg-black/35 px-4 py-4 font-medium leading-7 text-white/90 outline-none transition focus:border-violet-300/40"
                    placeholder="One lyric line per row."
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-white/40">
                      Parsed Lines
                    </p>
                    <span className="rounded-full bg-violet-400/10 px-3 py-1 text-xs font-black text-violet-100">
                      Line {currentLineIndex + 1} / {lines.length}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {INTERLUDE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => insertInterlude(preset.text, preset.type)}
                        className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-black uppercase tracking-wide text-white/78 transition hover:border-violet-300/30"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <SmallAction label="Stamp" onClick={stampCurrentLine} />
                    <SmallAction label="Skip" onClick={skipLine} />
                    <SmallAction label="Undo" onClick={undoStamp} />
                  </div>

                  <div className="mt-4 max-h-[360px] overflow-y-auto rounded-[1.4rem] border border-white/10 bg-black/30 p-2">
                    {lines.map((line, index) => {
                      const isCurrent = index === currentLineIndex;
                      const isActive = activeLineIndex === index && isPlaying;
                      const isStamped = line.timeMs !== null;

                      return (
                        <button
                          key={line.id}
                          type="button"
                          onClick={() => {
                            setCurrentLineIndex(index);
                            if (line.timeMs !== null && audioRef.current) {
                              audioRef.current.currentTime = (line.timeMs || 0) / 1000;
                              setPlaybackMs(line.timeMs || 0);
                            }
                          }}
                          className={`mb-2 flex w-full items-start justify-between gap-4 rounded-[1.15rem] border px-4 py-4 text-left transition ${
                            isCurrent || isActive
                              ? "border-violet-300/45 bg-violet-400/10"
                              : isStamped
                                ? "border-emerald-300/20 bg-emerald-400/5"
                                : "border-white/8 bg-white/[0.03]"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">
                              {index + 1} Â· {line.type}
                            </p>
                            <p className="mt-2 text-base font-bold leading-7 text-white/86">
                              {line.text}
                            </p>
                          </div>
                          <p className="font-mono text-sm font-black text-emerald-100">
                            {formatClock(line.timeMs)}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-black/35 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-300">
                      LRC Export
                    </p>
                    <pre className="mt-3 max-h-[160px] overflow-auto whitespace-pre-wrap font-mono text-sm leading-7 text-white/82">
                      {syncedPayload.lyricsLrc || "Stamped lines export here."}
                    </pre>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </section>
    </AdminShell>
  );
}

function EditorActions({
  onBack,
  onSave,
  isSaving,
  isDirty,
  isLoading,
}: {
  onBack: () => void;
  onSave: () => void;
  isSaving: boolean;
  isDirty: boolean;
  isLoading: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <button
        type="button"
        onClick={onBack}
        className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white/75"
      >
        Back To Release
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={isSaving || isLoading || !isDirty}
        className="rounded-2xl bg-gradient-to-r from-violet-300 via-fuchsia-300 to-amber-200 px-5 py-3 text-sm font-black text-black disabled:opacity-50"
      >
        {isSaving ? "Saving..." : "Save Synced Lyrics"}
      </button>
    </div>
  );
}

function HeroCard({
  artworkUrl,
  releaseTitle,
  trackTitle,
  isLoading,
}: {
  artworkUrl: string | null;
  releaseTitle: string;
  trackTitle: string;
  isLoading: boolean;
}) {
  if (isLoading) return <div className="h-[380px] animate-pulse rounded-[2rem] bg-white/[0.04]" />;

  return (
    <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#101018]/92 shadow-2xl">
      <div
        className="aspect-square bg-cover bg-center"
        style={{
          backgroundImage: artworkUrl
            ? `url("${artworkUrl}")`
            : "linear-gradient(135deg,rgba(167,139,250,0.28),rgba(244,114,182,0.12))",
        }}
      />
      <div className="p-5">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-300">
          {releaseTitle}
        </p>
        <h2 className="mt-3 text-3xl font-black">{trackTitle}</h2>
      </div>
    </div>
  );
}

function StatsPanel(props: {
  syncedCount: number;
  totalLines: number;
  playback: string;
  version: number;
  isDirty: boolean;
  isSaving: boolean;
  isLoading: boolean;
}) {
  if (props.isLoading) return <div className="h-40 animate-pulse rounded-[2rem] bg-white/[0.04]" />;

  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
      <StatRow label="Stamped" value={`${props.syncedCount}/${props.totalLines}`} />
      <StatRow label="Playback" value={props.playback} />
      <StatRow label="Version" value={`v${props.version}`} />
      <StatRow
        label="Status"
        value={props.isSaving ? "Saving..." : props.isDirty ? "Unsaved" : "Saved"}
      />
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3 flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <span className="text-sm font-bold text-white/60">{label}</span>
      <span className="text-sm font-black text-white">{value}</span>
    </div>
  );
}

function PlaybackPanel({
  audioRef,
  waveformRef,
  audioUrl,
  isPlaying,
  playbackMs,
  durationMs,
  isLoading,
  onToggle,
  onSeek,
  onLoaded,
  onTimeUpdate,
  onPlay,
  onPause,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  waveformRef: React.RefObject<HTMLDivElement | null>;
  audioUrl: string | null;
  isPlaying: boolean;
  playbackMs: number;
  durationMs: number;
  isLoading: boolean;
  onToggle: () => void;
  onSeek: (ms: number) => void;
  onLoaded: (ms: number) => void;
  onTimeUpdate: (ms: number) => void;
  onPlay: () => void;
  onPause: () => void;
}) {
  if (isLoading) return <div className="h-52 animate-pulse rounded-[2rem] bg-white/[0.04]" />;

  return (
    <div className="rounded-[2rem] border border-white/10 bg-[#101018]/92 p-5 shadow-2xl">
      <div
        ref={waveformRef}
        className="flex h-20 items-end gap-1 overflow-hidden rounded-[1rem] border border-violet-300/10 bg-gradient-to-b from-violet-500/10 to-black/40 px-2 py-2"
      >
        {Array.from({ length: 36 }).map((_, index) => (
          <div
            key={`wave-${index}`}
            className="w-full rounded-full bg-violet-300/35"
            style={{ height: `${20 + ((index * 13) % 60)}%` }}
          />
        ))}
      </div>

      {audioUrl ? (
        <>
          <audio
            ref={audioRef}
            src={audioUrl}
            preload="metadata"
            className="sr-only"
            onLoadedMetadata={(event) =>
              onLoaded(Math.round((event.currentTarget.duration || 0) * 1000))
            }
            onTimeUpdate={(event) =>
              onTimeUpdate(Math.round(event.currentTarget.currentTime * 1000))
            }
            onPlay={onPlay}
            onPause={onPause}
            onEnded={onPause}
          />
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={onToggle}
              className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-black"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            <p className="font-mono text-sm font-black">
              {formatClock(playbackMs)} / {formatClock(durationMs || null)}
            </p>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(durationMs, 1)}
            step={10}
            value={Math.min(playbackMs, durationMs || playbackMs)}
            onChange={(event) => onSeek(Number(event.target.value))}
            className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-violet-300"
          />
        </>
      ) : (
        <p className="mt-4 text-sm text-amber-100/80">Upload track audio before syncing.</p>
      )}
    </div>
  );
}

function AutoModePanel({
  onEven,
  onSmart,
  disabled,
}: {
  onEven: () => void;
  onSmart: () => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
      <button
        type="button"
        disabled={disabled}
        onClick={onEven}
        className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-left text-sm font-black disabled:opacity-40"
      >
        Even Timestamp Mode
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onSmart}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-left text-sm font-black disabled:opacity-40"
      >
        Smart Spacing Helper
      </button>
    </div>
  );
}

function ShortcutPanel({ onHide }: { onHide: () => void }) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-black/30 p-5 text-sm text-white/70">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-white/38">Shortcuts</p>
        <button type="button" onClick={onHide} className="text-xs font-black text-white/45">
          Hide
        </button>
      </div>
      <p className="mt-3">Space stamp Â· Shift+Space play Â· Enter skip Â· Backspace undo Â· â†/â†’ seek</p>
    </div>
  );
}

function SmallAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-black text-white/82"
    >
      {label}
    </button>
  );
}

function Notice({ tone, message }: { tone: "success" | "error"; message: string }) {
  return (
    <p
      className={`rounded-2xl border px-4 py-3 text-sm ${
        tone === "success"
          ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
          : "border-red-400/20 bg-red-500/10 text-red-100"
      }`}
    >
      {message}
    </p>
  );
}

