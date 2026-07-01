"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/auth";
import type {
  PodcastAdminEpisode,
  PodcastAdminShow,
} from "@/lib/podcastAdminCatalog";

type ShowsResponse = {
  success: boolean;
  shows?: PodcastAdminShow[];
  error?: string;
  details?: unknown;
};

type EpisodesResponse = {
  success: boolean;
  show_id?: string;
  episodes?: PodcastAdminEpisode[];
  error?: string;
  details?: unknown;
};

type ActionResponse = Record<string, unknown>;

const SHOW_APPROVE_PAYLOAD = {
  status: "approved",
  is_active: true,
  feed_status: "active",
} as const;

const SHOW_REJECT_PAYLOAD = {
  status: "rejected",
  is_active: false,
} as const;

const EPISODE_APPROVE_PAYLOAD = {
  status: "approved",
  is_active: true,
  playback_status: "playable",
} as const;

const EPISODE_REJECT_PAYLOAD = {
  status: "rejected",
  is_active: false,
} as const;

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(parsed));
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || "";
}

export default function PodcastModerationPage() {
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [shows, setShows] = useState<PodcastAdminShow[]>([]);
  const [episodes, setEpisodes] = useState<PodcastAdminEpisode[]>([]);
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [isLoadingShows, setIsLoadingShows] = useState(false);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionResponse, setActionResponse] = useState<string | null>(null);

  const loadShows = useCallback(async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setIsLoggedIn(false);
      return;
    }

    setIsLoadingShows(true);

    try {
      const response = await fetch("/api/admin/podcasts/shows", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const data = (await response.json()) as ShowsResponse;
      setActionResponse(formatJson(data));

      if (response.ok && data.success) {
        setShows(data.shows || []);
      } else {
        setShows([]);
      }
    } catch (error) {
      setShows([]);
      setActionResponse(
        formatJson({
          success: false,
          error: error instanceof Error ? error.message : "Failed to load shows.",
        })
      );
    } finally {
      setIsLoadingShows(false);
    }
  }, []);

  const loadEpisodes = useCallback(async (showId: string) => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setIsLoggedIn(false);
      return;
    }

    setIsLoadingEpisodes(true);
    setSelectedShowId(showId);

    try {
      const response = await fetch(
        `/api/admin/podcasts/episodes?showId=${encodeURIComponent(showId)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        }
      );
      const data = (await response.json()) as EpisodesResponse;
      setActionResponse(formatJson(data));

      if (response.ok && data.success) {
        setEpisodes(data.episodes || []);
      } else {
        setEpisodes([]);
      }
    } catch (error) {
      setEpisodes([]);
      setActionResponse(
        formatJson({
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to load episodes.",
        })
      );
    } finally {
      setIsLoadingEpisodes(false);
    }
  }, []);

  useEffect(() => {
    async function checkSession() {
      const token = await getAccessToken();
      setIsLoggedIn(Boolean(token));
      setIsCheckingSession(false);

      if (token) {
        void loadShows();
      }
    }

    void checkSession();
  }, [loadShows]);

  async function patchShow(
    showId: string,
    payload: Record<string, unknown>,
    actionKey: string
  ) {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setIsLoggedIn(false);
      return;
    }

    setBusyKey(actionKey);

    try {
      const response = await fetch(`/api/admin/podcasts/shows/${showId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as ActionResponse;
      setActionResponse(formatJson(data));

      if (response.ok && data.success) {
        await loadShows();
        if (selectedShowId === showId) {
          await loadEpisodes(showId);
        }
      }
    } catch (error) {
      setActionResponse(
        formatJson({
          success: false,
          error: error instanceof Error ? error.message : "Show update failed.",
        })
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function patchEpisode(
    episodeId: string,
    payload: Record<string, unknown>,
    actionKey: string
  ) {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setIsLoggedIn(false);
      return;
    }

    setBusyKey(actionKey);

    try {
      const response = await fetch(`/api/admin/podcasts/episodes/${episodeId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as ActionResponse;
      setActionResponse(formatJson(data));

      if (response.ok && data.success && selectedShowId) {
        await loadEpisodes(selectedShowId);
        await loadShows();
      }
    } catch (error) {
      setActionResponse(
        formatJson({
          success: false,
          error:
            error instanceof Error ? error.message : "Episode update failed.",
        })
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function approveFirstTwentyEpisodes() {
    if (!selectedShowId || episodes.length === 0) return;

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setIsLoggedIn(false);
      return;
    }

    setBusyKey("bulk-approve-episodes");

    const targets = episodes.slice(0, 20);
    const results: ActionResponse[] = [];

    try {
      for (const episode of targets) {
        const response = await fetch(
          `/api/admin/podcasts/episodes/${episode.id}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(EPISODE_APPROVE_PAYLOAD),
          }
        );
        const data = (await response.json()) as ActionResponse;
        results.push({
          episode_id: episode.id,
          episode_title: episode.title,
          http_status: response.status,
          ...data,
        });
      }

      setActionResponse(
        formatJson({
          success: true,
          action: "approve_first_20_episodes",
          processed: results.length,
          results,
        })
      );

      await loadEpisodes(selectedShowId);
      await loadShows();
    } catch (error) {
      setActionResponse(
        formatJson({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Bulk episode approval failed.",
          partial_results: results,
        })
      );
    } finally {
      setBusyKey(null);
    }
  }

  if (isCheckingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050508] px-4 text-white">
        <p className="text-sm text-white/60">Checking session...</p>
      </main>
    );
  }

  if (!isLoggedIn) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050508] px-4 text-white">
        <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <h1 className="text-2xl font-black">Podcast Moderation</h1>
          <p className="mt-4 text-sm text-white/70">Please log in first.</p>
          <Link
            href="/admin/login"
            className="mt-6 inline-block rounded-2xl border border-yellow-300/30 bg-yellow-300/10 px-5 py-3 text-sm font-bold text-yellow-100"
          >
            Go to admin login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050508] px-4 py-8 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-black tracking-[-0.04em]">
                Podcast Moderation
              </h1>
              <p className="mt-2 text-sm text-white/60">
                Review ingested pending shows and episodes.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/podcasts/ingest"
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-white/80"
              >
                Ingest test
              </Link>
              <button
                type="button"
                onClick={() => void loadShows()}
                disabled={isLoadingShows}
                className="rounded-2xl border border-yellow-300/30 bg-yellow-300/10 px-4 py-2 text-sm font-bold text-yellow-100 disabled:opacity-50"
              >
                {isLoadingShows ? "Refreshing..." : "Refresh shows"}
              </button>
            </div>
          </div>
        </header>

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-xl font-black">Shows</h2>
          {isLoadingShows && shows.length === 0 ? (
            <p className="mt-4 text-sm text-white/60">Loading shows...</p>
          ) : shows.length === 0 ? (
            <p className="mt-4 text-sm text-white/60">No podcast shows found.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {shows.map((show) => {
                const isSelected = selectedShowId === show.id;

                return (
                  <article
                    key={show.id}
                    className={`rounded-2xl border p-4 ${
                      isSelected
                        ? "border-yellow-300/30 bg-yellow-300/5"
                        : "border-white/10 bg-black/20"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void loadEpisodes(show.id)}
                      className="w-full text-left"
                    >
                      <h3 className="text-lg font-bold">{show.title}</h3>
                      <dl className="mt-3 grid gap-2 text-sm text-white/75 sm:grid-cols-2">
                        <div>
                          <dt className="text-white/45">Author</dt>
                          <dd>{show.host_name || "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-white/45">Status</dt>
                          <dd>{show.status}</dd>
                        </div>
                        <div>
                          <dt className="text-white/45">Feed status</dt>
                          <dd>{show.feed_status}</dd>
                        </div>
                        <div>
                          <dt className="text-white/45">Active</dt>
                          <dd>{show.is_active ? "true" : "false"}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-white/45">Feed URL</dt>
                          <dd className="break-all">{show.feed_url || "—"}</dd>
                        </div>
                      </dl>
                    </button>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <ActionButton
                        label="Approve show"
                        busy={busyKey === `show-approve-${show.id}`}
                        onClick={() =>
                          void patchShow(
                            show.id,
                            { ...SHOW_APPROVE_PAYLOAD },
                            `show-approve-${show.id}`
                          )
                        }
                      />
                      <ActionButton
                        label="Reject show"
                        busy={busyKey === `show-reject-${show.id}`}
                        onClick={() =>
                          void patchShow(
                            show.id,
                            { ...SHOW_REJECT_PAYLOAD },
                            `show-reject-${show.id}`
                          )
                        }
                      />
                      <ActionButton
                        label="Activate show"
                        busy={busyKey === `show-activate-${show.id}`}
                        onClick={() =>
                          void patchShow(
                            show.id,
                            { is_active: true },
                            `show-activate-${show.id}`
                          )
                        }
                      />
                      <ActionButton
                        label="Mark feed active"
                        busy={busyKey === `show-feed-${show.id}`}
                        onClick={() =>
                          void patchShow(
                            show.id,
                            { feed_status: "active" },
                            `show-feed-${show.id}`
                          )
                        }
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {selectedShowId ? (
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black">Episodes</h2>
              <button
                type="button"
                onClick={() => void approveFirstTwentyEpisodes()}
                disabled={
                  busyKey === "bulk-approve-episodes" ||
                  isLoadingEpisodes ||
                  episodes.length === 0
                }
                className="rounded-2xl border border-green-300/30 bg-green-300/10 px-4 py-2 text-sm font-bold text-green-100 disabled:opacity-50"
              >
                {busyKey === "bulk-approve-episodes"
                  ? "Approving..."
                  : "Approve first 20 episodes"}
              </button>
            </div>

            {isLoadingEpisodes ? (
              <p className="mt-4 text-sm text-white/60">Loading episodes...</p>
            ) : episodes.length === 0 ? (
              <p className="mt-4 text-sm text-white/60">No episodes for this show.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {episodes.map((episode) => (
                  <article
                    key={episode.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <h3 className="text-base font-bold">{episode.title}</h3>
                    <dl className="mt-3 grid gap-2 text-sm text-white/75 sm:grid-cols-2">
                      <div>
                        <dt className="text-white/45">Status</dt>
                        <dd>{episode.status}</dd>
                      </div>
                      <div>
                        <dt className="text-white/45">Playback status</dt>
                        <dd>{episode.playback_status}</dd>
                      </div>
                      <div>
                        <dt className="text-white/45">Active</dt>
                        <dd>{episode.is_active ? "true" : "false"}</dd>
                      </div>
                      <div>
                        <dt className="text-white/45">Published</dt>
                        <dd>{formatDate(episode.published_at)}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-white/45">Audio URL</dt>
                        <dd className="break-all">{episode.audio_url || "—"}</dd>
                      </div>
                    </dl>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <ActionButton
                        label="Approve episode"
                        busy={busyKey === `episode-approve-${episode.id}`}
                        onClick={() =>
                          void patchEpisode(
                            episode.id,
                            { ...EPISODE_APPROVE_PAYLOAD },
                            `episode-approve-${episode.id}`
                          )
                        }
                      />
                      <ActionButton
                        label="Reject episode"
                        busy={busyKey === `episode-reject-${episode.id}`}
                        onClick={() =>
                          void patchEpisode(
                            episode.id,
                            { ...EPISODE_REJECT_PAYLOAD },
                            `episode-reject-${episode.id}`
                          )
                        }
                      />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {actionResponse ? (
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-sm font-bold text-white/80">Last action response</h2>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-xs leading-6 text-white/80">
              {actionResponse}
            </pre>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function ActionButton({
  label,
  busy,
  onClick,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold text-white/85 disabled:opacity-50"
    >
      {busy ? "Working..." : label}
    </button>
  );
}
