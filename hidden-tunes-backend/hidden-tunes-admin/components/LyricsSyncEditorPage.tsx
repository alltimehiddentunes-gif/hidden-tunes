"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import AdminShell from "@/components/AdminShell";
import { getActiveUploaderSession, supabase } from "@/lib/auth";

type SyncLine = {
  id: string;
  text: string;
  timeMs: number | null;
};

type LyricsResponse = {
  success: boolean;
  error?: string;
  release?: {
    id: string;
    title: string;
    artworkUrl: string | null;
  };
  track?: {
    id: string;
    title: string;
    artworkUrl: string | null;
    audioUrl: string | null;
  };
  lyrics?: {
    plainLyrics: string;
    syncedLrc: string;
    lyricsType: string | null;
    lyricsUrl: string | null;
    source: string | null;
  };
  message?: string;
};

function getParamId(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function splitPlainLines(plainLyrics: string) {
  return plainLyrics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseTimestampToMs(minutes: number, seconds: number, fractionRaw: string) {
  const fraction =
    fractionRaw.length === 1
      ? Number(fractionRaw) * 100
      : fractionRaw.length === 2
        ? Number(fractionRaw) * 10
        : Number(fractionRaw.slice(0, 3));

  return minutes * 60 * 1000 + seconds * 1000 + fraction;
}

function parseLrcTimestamps(lrc: string) {
  const entries: Array<{ timeMs: number; text: string }> = [];

  lrc.split(/\r?\n/).forEach((row) => {
    const matches = [
      ...row.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g),
    ];
    const text = row.replace(/\[(.*?)\]/g, "").trim();

    if (!matches.length || !text) return;

    matches.forEach((match) => {
      entries.push({
        timeMs: parseTimestampToMs(
          Number(match[1] || 0),
          Number(match[2] || 0),
          match[3] || "0"
        ),
        text,
      });
    });
  });

  return entries.sort((a, b) => a.timeMs - b.timeMs);
}

function buildSyncLines(plainLyrics: string, syncedLrc: string): SyncLine[] {
  const plainLines = splitPlainLines(plainLyrics);
  const syncedEntries = parseLrcTimestamps(syncedLrc);

  return plainLines.map((text, index) => ({
    id: `line-${index}`,
    text,
    timeMs:
      syncedEntries[index]?.timeMs ??
      syncedEntries.find((entry) => entry.text === text)?.timeMs ??
      null,
  }));
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

function linesToLrc(lines: SyncLine[]) {
  return lines
    .filter((line) => line.text.trim() && line.timeMs !== null)
    .sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0))
    .map((line) => `${msToLrcTimestamp(line.timeMs || 0)}${line.text}`)
    .join("\n");
}

function findActiveLineIndex(lines: SyncLine[], positionMs: number) {
  const timed = lines
    .map((line, index) => ({ index, timeMs: line.timeMs }))
    .filter((line) => line.timeMs !== null) as Array<{
    index: number;
    timeMs: number;
  }>;

  if (!timed.length) return -1;

  let answer = timed[0].index;

  timed.forEach((line) => {
    if (positionMs >= line.timeMs) {
      answer = line.index;
    }
  });

  return answer;
}

export default function LyricsSyncEditorPage() {
  const router = useRouter();
  const params = useParams<{
    id?: string | string[];
    trackId?: string | string[];
  }>();
  const releaseId = getParamId(params.id);
  const trackId = getParamId(params.trackId);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [accessToken, setAccessToken] = useState("");
  const [releaseTitle, setReleaseTitle] = useState("Release");
  const [trackTitle, setTrackTitle] = useState("Track");
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [lines, setLines] = useState<SyncLine[]>([]);
  const [savedSyncedLrc, setSavedSyncedLrc] = useState("");
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [playbackMs, setPlaybackMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [showPreviewPanel, setShowPreviewPanel] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const generatedLrc = useMemo(() => linesToLrc(lines), [lines]);
  const isDirty = generatedLrc !== savedSyncedLrc;

  const syncedCount = useMemo(
    () => lines.filter((line) => line.timeMs !== null).length,
    [lines]
  );

  const currentLine = lines[currentLineIndex] || null;

  const loadEditor = useCallback(
    async (token: string) => {
      const response = await fetch(
        `/api/admin/releases/${releaseId}/tracks/${trackId}/lyrics`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = (await response.json().catch(() => null)) as
        | LyricsResponse
        | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Lyrics sync editor could not load.");
      }

      const loadedPlain = data.lyrics?.plainLyrics || "";
      const loadedSynced = data.lyrics?.syncedLrc || "";
      const loadedAudio = data.track?.audioUrl || null;

      if (!loadedPlain.trim()) {
        throw new Error("Add plain lyrics before using the sync editor.");
      }

      if (!loadedAudio) {
        throw new Error("Upload track audio before syncing lyrics.");
      }

      const syncLines = buildSyncLines(loadedPlain, loadedSynced);

      setReleaseTitle(data.release?.title || "Release");
      setTrackTitle(data.track?.title || "Track");
      setArtworkUrl(data.track?.artworkUrl || data.release?.artworkUrl || null);
      setAudioUrl(loadedAudio);
      setLines(syncLines);
      setSavedSyncedLrc(loadedSynced);
      setCurrentLineIndex(0);
      setStatusMessage(
        loadedSynced.trim()
          ? "Loaded existing synced lyrics."
          : "Ready to mark lyric timestamps."
      );
    },
    [releaseId, trackId]
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
          error instanceof Error
            ? error.message
            : "Lyrics sync editor could not load."
        );
      } finally {
        setIsLoading(false);
      }
    }

    boot();
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

  useEffect(() => {
    if (!isPreviewMode || !isPlaying) return;

    const previewIndex = findActiveLineIndex(lines, playbackMs);

    if (previewIndex >= 0 && previewIndex !== currentLineIndex) {
      setCurrentLineIndex(previewIndex);
    }
  }, [currentLineIndex, isPlaying, isPreviewMode, lines, playbackMs]);

  const updateLineTime = useCallback((index: number, timeMs: number | null) => {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, timeMs } : line
      )
    );
    setStatusMessage("");
    setErrorMessage("");
  }, []);

  const adjustCurrentLine = useCallback(
    (deltaMs: number) => {
      if (!currentLine || currentLine.timeMs === null) return;

      updateLineTime(
        currentLineIndex,
        Math.max(0, currentLine.timeMs + deltaMs)
      );
    },
    [currentLine, currentLineIndex, updateLineTime]
  );

  const handleMarkCurrentLine = useCallback(() => {
    const audio = audioRef.current;

    if (!audio) return;

    const markedMs = Math.max(0, Math.round(audio.currentTime * 1000));
    updateLineTime(currentLineIndex, markedMs);
    setStatusMessage(`Marked line ${currentLineIndex + 1} at ${formatClock(markedMs)}.`);
  }, [currentLineIndex, updateLineTime]);

  const handleTogglePlayback = useCallback(async () => {
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

  const handleSeekLine = useCallback(
    (line: SyncLine) => {
      const audio = audioRef.current;

      if (!audio || line.timeMs === null) return;

      audio.currentTime = line.timeMs / 1000;
      setPlaybackMs(line.timeMs);
    },
    []
  );

  function handleBackToRelease() {
    if (isDirty) {
      const shouldLeave = window.confirm(
        "You have unsaved synced lyrics. Leave without saving?"
      );
      if (!shouldLeave) return;
    }

    router.push(`/admin/releases/${releaseId}`);
  }

  async function handleSave() {
    setErrorMessage("");
    setStatusMessage("");

    if (!accessToken) {
      router.replace("/admin/login");
      return;
    }

    if (!generatedLrc.trim()) {
      setErrorMessage("Mark at least one lyric line before saving synced LRC.");
      return;
    }

    if (syncedCount < lines.length) {
      const shouldContinue = window.confirm(
        `${lines.length - syncedCount} line(s) are still unmarked. Save synced lyrics anyway?`
      );
      if (!shouldContinue) return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/admin/releases/${releaseId}/tracks/${trackId}/lyrics`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: "synced",
            value: generatedLrc,
          }),
        }
      );

      const data = (await response.json().catch(() => null)) as
        | LyricsResponse
        | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Synced lyrics could not be saved.");
      }

      setSavedSyncedLrc(generatedLrc);
      setStatusMessage(data.message || "Synced lyrics saved.");
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Synced lyrics could not be saved."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AdminShell
      title="Sync Lyrics"
      description="Play the uploaded track and mark each lyric line at the exact moment it is sung."
      actions={
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={handleBackToRelease}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white/75 transition hover:border-white/25"
          >
            Back To Release
          </button>
          <button
            onClick={() => setShowPreviewPanel((current) => !current)}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white/75 transition hover:border-white/25"
          >
            {showPreviewPanel ? "Hide LRC Preview" : "Preview Synced Lyrics"}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading || !isDirty}
            className="rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black text-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Synced LRC"}
          </button>
        </div>
      }
    >
      <section className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <aside className="flex flex-col gap-5">
          <div className="overflow-hidden rounded-[2.1rem] border border-white/10 bg-[#101017]/92 shadow-2xl">
            <div
              className="aspect-square bg-[#14141c] bg-cover bg-center"
              style={{
                backgroundImage: artworkUrl
                  ? `url("${artworkUrl}")`
                  : "linear-gradient(135deg,rgba(250,204,21,0.24),rgba(168,85,247,0.12),rgba(255,255,255,0.04))",
              }}
            />
            <div className="p-5">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
                {releaseTitle}
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">
                {trackTitle}
              </h2>
              <p className="mt-4 text-sm leading-6 text-white/55">
                Listen to the uploaded audio, press Mark Current Line while each
                lyric is sung, then fine-tune timestamps.
              </p>
            </div>
          </div>

          <div className="rounded-[2.1rem] border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-white/38">
              Sync Status
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <StatRow
                label="Marked lines"
                value={`${syncedCount}/${lines.length}`}
              />
              <StatRow
                label="Current line"
                value={lines.length ? `${currentLineIndex + 1}` : "0"}
              />
              <StatRow
                label="Playback"
                value={formatClock(playbackMs)}
              />
              <StatRow label="Editor" value={isDirty ? "Unsaved" : "Saved"} />
            </div>
          </div>

          {audioUrl ? (
            <div className="rounded-[2.1rem] border border-white/10 bg-[#101017]/92 p-5 shadow-2xl">
              <audio
                ref={audioRef}
                src={audioUrl}
                preload="metadata"
                className="w-full"
                controls
                onTimeUpdate={(event) => {
                  setPlaybackMs(Math.round(event.currentTarget.currentTime * 1000));
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
              />
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => void handleTogglePlayback()}
                  className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-black text-white transition hover:border-white/25"
                >
                  {isPlaying ? "Pause" : "Play"}
                </button>
                <button
                  onClick={() => setIsPreviewMode((current) => !current)}
                  className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
                    isPreviewMode
                      ? "bg-emerald-400/15 text-emerald-100 border border-emerald-300/25"
                      : "border border-white/10 bg-white/[0.06] text-white/80"
                  }`}
                >
                  {isPreviewMode ? "Preview On" : "Preview Off"}
                </button>
              </div>
            </div>
          ) : null}
        </aside>

        <section className="rounded-[2.1rem] border border-white/10 bg-[#101017]/92 p-5 shadow-2xl">
          {isLoading ? (
            <div className="h-[720px] rounded-[1.5rem] bg-white/[0.04]" />
          ) : errorMessage && !lines.length ? (
            <div className="rounded-[1.5rem] border border-red-400/20 bg-red-500/10 p-6">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-red-200">
                Sync editor unavailable
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">
                Could not open sync editor
              </h2>
              <p className="mt-3 text-sm leading-6 text-red-100/80">
                {errorMessage}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={() =>
                    router.push(
                      `/admin/releases/${releaseId}/tracks/${trackId}/lyrics`
                    )
                  }
                  className="rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black text-black"
                >
                  Edit Plain Lyrics
                </button>
                <button
                  onClick={handleBackToRelease}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white/75"
                >
                  Back To Release
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
                    Manual Sync Workspace
                  </p>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">
                    Mark lyric lines to the beat
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
                    Select a line, play the song, and tap Mark Current Line when
                    that lyric starts. Use the nudge buttons for ±100ms and ±500ms
                    adjustments.
                  </p>
                </div>
                <div className="rounded-full bg-yellow-300/10 px-3 py-2 text-xs font-black uppercase tracking-widest text-yellow-100">
                  Line {currentLineIndex + 1} of {lines.length}
                </div>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]">
                <button
                  onClick={handleMarkCurrentLine}
                  className="rounded-[1.4rem] bg-yellow-300 px-6 py-4 text-base font-black text-black transition hover:-translate-y-0.5"
                >
                  Mark Current Line
                </button>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <SmallAction
                    label="Previous"
                    onClick={() =>
                      setCurrentLineIndex((index) => Math.max(0, index - 1))
                    }
                  />
                  <SmallAction
                    label="Next"
                    onClick={() =>
                      setCurrentLineIndex((index) =>
                        Math.min(lines.length - 1, index + 1)
                      )
                    }
                  />
                  <SmallAction label="-100ms" onClick={() => adjustCurrentLine(-100)} />
                  <SmallAction label="+100ms" onClick={() => adjustCurrentLine(100)} />
                  <SmallAction label="-500ms" onClick={() => adjustCurrentLine(-500)} />
                  <SmallAction label="+500ms" onClick={() => adjustCurrentLine(500)} />
                  <SmallAction
                    label="Jump To Line"
                    onClick={() => currentLine && handleSeekLine(currentLine)}
                    disabled={!currentLine || currentLine.timeMs === null}
                  />
                  <SmallAction
                    label="Clear Timestamp"
                    onClick={() => updateLineTime(currentLineIndex, null)}
                  />
                </div>
              </div>

              <div className="mt-5 max-h-[520px] overflow-y-auto rounded-[1.5rem] border border-white/10 bg-black/30 p-3">
                {lines.map((line, index) => {
                  const isCurrent = index === currentLineIndex;
                  const isMarked = line.timeMs !== null;
                  const isActivePreview =
                    isPreviewMode &&
                    isPlaying &&
                    findActiveLineIndex(lines, playbackMs) === index;

                  return (
                    <button
                      key={line.id}
                      onClick={() => {
                        setCurrentLineIndex(index);
                        if (isMarked) handleSeekLine(line);
                      }}
                      className={`mb-2 flex w-full items-start justify-between gap-4 rounded-[1.2rem] border px-4 py-4 text-left transition ${
                        isCurrent || isActivePreview
                          ? "border-yellow-300/40 bg-yellow-300/10"
                          : isMarked
                            ? "border-emerald-300/20 bg-emerald-400/5"
                            : "border-white/8 bg-white/[0.03] hover:border-white/18"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/35">
                          Line {index + 1}
                        </p>
                        <p
                          className={`mt-2 text-base font-bold leading-7 ${
                            isCurrent || isActivePreview
                              ? "text-yellow-100"
                              : "text-white/86"
                          }`}
                        >
                          {line.text}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/35">
                          Timestamp
                        </p>
                        <p className="mt-2 font-mono text-sm font-black text-emerald-100">
                          {formatClock(line.timeMs)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {showPreviewPanel ? (
                <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-black/35 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
                    LRC Preview
                  </p>
                  <pre className="mt-4 max-h-[220px] overflow-auto whitespace-pre-wrap font-mono text-sm leading-7 text-white/82">
                    {generatedLrc || "Marked lines will appear here as LRC."}
                  </pre>
                </div>
              ) : null}

              <div className="mt-4 flex flex-col gap-3">
                {statusMessage ? (
                  <Notice tone="success" message={statusMessage} />
                ) : null}
                {errorMessage ? <Notice tone="error" message={errorMessage} /> : null}
              </div>
            </>
          )}
        </section>
      </section>
    </AdminShell>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <span className="text-sm font-bold text-white/60">{label}</span>
      <span className="text-sm font-black text-white">{value}</span>
    </div>
  );
}

function SmallAction({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-black text-white/82 transition hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-40"
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
