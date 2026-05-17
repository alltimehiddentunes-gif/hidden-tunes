"use client";

import { useCallback, useEffect, useState } from "react";
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
  track?: {
    id: string;
    title: string;
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

export default function LyricsEditorPage({ mode }: LyricsEditorPageProps) {
  const router = useRouter();
  const params = useParams<{
    id?: string | string[];
    trackId?: string | string[];
  }>();
  const releaseId = getParamId(params.id);
  const trackId = getParamId(params.trackId);
  const [accessToken, setAccessToken] = useState("");
  const [trackTitle, setTrackTitle] = useState("Track");
  const [value, setValue] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const editorTitle =
    mode === "plain" ? "Plain Lyrics Editor" : "Synced Lyrics Editor";
  const editorDescription =
    mode === "plain"
      ? "Edit the readable lyric text for this track without changing audio, artwork, or release metadata."
      : "Edit LRC synced lyrics for this track. Use timestamps such as [00:12.34] before lyric lines.";

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

      setTrackTitle(data.track?.title || "Track");
      setValue(
        mode === "plain"
          ? data.lyrics?.plainLyrics || ""
          : data.lyrics?.syncedLrc || ""
      );
    },
    [mode, releaseId, trackId]
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
          throw new Error("Your admin session expired. Sign in again.");
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

  async function handleSave() {
    setErrorMessage("");
    setStatusMessage("");

    if (mode === "synced" && !hasBasicLrcTimestamp(value)) {
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

      setStatusMessage(data.message || "Lyrics saved.");
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
        <button
          onClick={() => router.push(`/admin/releases/${releaseId}`)}
          className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white/75 transition hover:border-white/25"
        >
          Back To Release
        </button>
      }
    >
      <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <aside className="rounded-[2.1rem] border border-white/10 bg-[#101017]/92 p-5 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
            Track
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">
            {trackTitle}
          </h2>
          <p className="mt-4 text-sm leading-6 text-white/55">
            {mode === "plain"
              ? "Plain lyrics are used for readable lyric displays and fallback lyric views."
              : "Synced lyrics should stay in LRC format so timing remains compatible with the listener app."}
          </p>
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-xs font-black uppercase tracking-widest text-white/35">
              Editor mode
            </p>
            <p className="mt-2 text-lg font-black">
              {mode === "plain" ? "Plain text" : "Synced LRC"}
            </p>
          </div>
        </aside>

        <section className="rounded-[2.1rem] border border-white/10 bg-[#101017]/92 p-5 shadow-2xl">
          {isLoading ? (
            <div className="h-[520px] rounded-[1.5rem] bg-white/[0.04]" />
          ) : (
            <>
              <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
                    Lyrics Workspace
                  </p>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">
                    Edit and save
                  </h2>
                </div>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black text-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save Lyrics"}
                </button>
              </div>

              <textarea
                value={value}
                onChange={(event) => setValue(event.target.value)}
                spellCheck={false}
                placeholder={
                  mode === "plain"
                    ? "Write plain lyrics here..."
                    : "[00:12.34] Write synced LRC lyrics here..."
                }
                className="mt-5 min-h-[520px] w-full resize-y rounded-[1.5rem] border border-white/10 bg-black/35 p-5 font-mono text-sm leading-7 text-white/88 outline-none transition placeholder:text-white/24 focus:border-yellow-300/50"
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
