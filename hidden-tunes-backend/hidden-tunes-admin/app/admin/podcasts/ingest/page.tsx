"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/auth";

export default function PodcastIngestTestPage() {
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [feedUrl, setFeedUrl] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [responseJson, setResponseJson] = useState<string | null>(null);

  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setIsLoggedIn(Boolean(session?.access_token));
      setIsCheckingSession(false);
    }

    void checkSession();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token || "";

    if (!accessToken) {
      setIsLoggedIn(false);
      setResponseJson(null);
      return;
    }

    setIsLoading(true);
    setResponseJson(null);

    try {
      const response = await fetch("/api/admin/podcasts/ingest", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          feed_url: feedUrl.trim(),
          auto_approve: autoApprove,
        }),
      });

      const data = await response.json();
      setResponseJson(JSON.stringify(data, null, 2));
    } catch (error) {
      setResponseJson(
        JSON.stringify(
          {
            success: false,
            error:
              error instanceof Error ? error.message : "Ingest request failed.",
          },
          null,
          2
        )
      );
    } finally {
      setIsLoading(false);
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
          <h1 className="text-2xl font-black">Podcast RSS Ingest Test</h1>
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
    <main className="min-h-screen bg-[#050508] px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
        <h1 className="text-3xl font-black tracking-[-0.04em]">
          Podcast RSS Ingest Test
        </h1>
        <p className="mt-2 text-sm text-white/60">
          Temporary test page for POST /api/admin/podcasts/ingest
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-sm font-bold text-white/80">RSS feed URL</span>
            <input
              type="url"
              value={feedUrl}
              onChange={(event) => setFeedUrl(event.target.value)}
              placeholder="https://feeds.example.com/podcast.rss"
              required
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none ring-yellow-300/40 focus:ring-2"
            />
          </label>

          <label className="flex items-center gap-3 text-sm text-white/80">
            <input
              type="checkbox"
              checked={autoApprove}
              onChange={(event) => setAutoApprove(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-black/30"
            />
            Auto approve safe feed
          </label>

          <button
            type="submit"
            disabled={isLoading || !feedUrl.trim()}
            className="rounded-2xl border border-yellow-300/30 bg-yellow-300/10 px-5 py-3 text-sm font-black text-yellow-100 transition hover:bg-yellow-300/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "Ingesting..." : "Ingest Feed"}
          </button>
        </form>

        {responseJson ? (
          <div className="mt-8">
            <p className="text-sm font-bold text-white/80">Response</p>
            <pre className="mt-2 overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-xs leading-6 text-white/80">
              {responseJson}
            </pre>
          </div>
        ) : null}
      </div>
    </main>
  );
}
