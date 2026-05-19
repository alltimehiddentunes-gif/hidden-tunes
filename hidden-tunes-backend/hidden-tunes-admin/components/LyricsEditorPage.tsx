"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import AdminShell from "@/components/AdminShell";
import { getActiveUploaderSession, supabase } from "@/lib/auth";

type LyricsMode = "plain" | "synced";

type LyricsEditorPageProps = {
  mode: LyricsMode;
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

function hasBasicLrcTimestamp(value: string) {
  if (!value.trim()) return true;
  return /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/.test(value);
}

function countWords(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

export default function LyricsEditorPage({ mode }: LyricsEditorPageProps) {
  const router = useRouter();
  const params = useParams<{
    id?: string | string[];
    trackId?: string | string[];
  }>();
  const releaseId = getParamId(params.id);
  const trackId = getParamId(params.trackId);
  const [accessToken, setAccessToken] = useState("");
  const [releaseTitle, setReleaseTitle] = useState("Release");
  const [trackTitle, setTrackTitle] = useState("Track");
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [savedValue, setSavedValue] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const isPlainMode = mode === "plain";
  const isDirty = value !== savedValue;
  const wordCount = useMemo(() => countWords(value), [value]);
  const characterCount = value.length;
  const lineCount = useMemo(
    () => (value ? value.split(/\r\n|\r|\n/).length : 0),
    [value]
  );
  const editorTitle = isPlainMode ? "Plain Lyrics Editor" : "Synced Lyrics Editor";
  const editorDescription = isPlainMode
    ? "Edit readable lyric text while preserving line breaks exactly for the listener experience."
    : "Edit synced LRC text. Timing tools are not part of this phase.";

  const loadLyrics = useCallback(
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
        throw new Error(data?.error || "Lyrics could not be loaded.");
      }

      const loadedValue = isPlainMode
        ? data.lyrics?.plainLyrics || ""
        : data.lyrics?.syncedLrc || "";

      setReleaseTitle(data.release?.title || "Release");
      setTrackTitle(data.track?.title || "Track");
      setArtworkUrl(data.track?.artworkUrl || data.release?.artworkUrl || null);
      setValue(loadedValue);
      setSavedValue(loadedValue);
      setStatusMessage(loadedValue ? "Saved" : "Ready for lyrics");
    },
    [isPlainMode, releaseId, trackId]
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
        await loadLyrics(token);
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error ? error.message : "Lyrics editor could not load."
        );
      } finally {
        setIsLoading(false);
      }
    }

    boot();
  }, [loadLyrics, router]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!isDirty) return;

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  function handleBackToRelease() {
    if (isDirty) {
      const shouldLeave = window.confirm(
        "You have unsaved lyrics changes. Leave without saving?"
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

    if (!isPlainMode && !hasBasicLrcTimestamp(value)) {
      setErrorMessage("Add at least one LRC timestamp like [00:12.34].");
      return;
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
            mode,
            value,
          }),
        }
      );
      const data = (await response.json().catch(() => null)) as
        | LyricsResponse
        | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Lyrics could not be saved.");
      }

      setSavedValue(value);
      setStatusMessage(data.message || "Saved");
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Lyrics could not be saved."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AdminShell
      title={editorTitle}
      description={editorDescription}
      actions={
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={handleBackToRelease}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white/75 transition hover:border-white/25"
          >
            Back To Release
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading || !isDirty}
            className="rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black text-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Lyrics"}
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
                {isPlainMode
                  ? "Plain lyrics are saved exactly as written, including line breaks and spacing."
                  : "Synced lyrics remain a simple LRC textarea in this phase."}
              </p>
            </div>
          </div>

          <div className="rounded-[2.1rem] border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-white/38">
              Editor Status
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <StatRow label="State" value={isDirty ? "Unsaved changes" : "Saved"} />
              <StatRow label="Words" value={String(wordCount)} />
              <StatRow label="Characters" value={String(characterCount)} />
              <StatRow label="Lines" value={String(lineCount)} />
            </div>
          </div>
        </aside>

        <section className="rounded-[2.1rem] border border-white/10 bg-[#101017]/92 p-5 shadow-2xl">
          {isLoading ? (
            <div className="h-[620px] rounded-[1.5rem] bg-white/[0.04]" />
          ) : errorMessage && !value && !savedValue ? (
            <div className="rounded-[1.5rem] border border-red-400/20 bg-red-500/10 p-6">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-red-200">
                Editor unavailable
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">
                Could not load lyrics
              </h2>
              <p className="mt-3 text-sm leading-6 text-red-100/80">
                {errorMessage}
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
                    Lyrics Workspace
                  </p>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">
                    {isPlainMode ? "Write plain lyrics" : "Edit synced LRC"}
                  </h2>
                </div>
                <div
                  className={`rounded-full px-3 py-2 text-xs font-black uppercase tracking-widest ${
                    isDirty
                      ? "bg-yellow-300/10 text-yellow-100"
                      : "bg-emerald-400/10 text-emerald-100"
                  }`}
                >
                  {isDirty ? "Unsaved changes" : "Saved"}
                </div>
              </div>

              <textarea
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setStatusMessage("");
                  setErrorMessage("");
                }}
                spellCheck={isPlainMode}
                placeholder={
                  isPlainMode
                    ? "Paste or write the plain lyrics here. Line breaks will be preserved exactly."
                    : "[00:12.34] Existing synced LRC can be edited here."
                }
                className="mt-5 min-h-[620px] w-full resize-y rounded-[1.5rem] border border-white/10 bg-black/35 p-5 font-mono text-sm leading-7 text-white/88 outline-none transition placeholder:text-white/24 focus:border-yellow-300/50"
              />

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
