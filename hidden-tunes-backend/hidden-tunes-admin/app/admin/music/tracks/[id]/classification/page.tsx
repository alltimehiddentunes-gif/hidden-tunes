"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AdminShell from "@/components/AdminShell";
import MusicTaxonomyControls from "@/components/MusicTaxonomyControls";
import { supabase } from "@/lib/auth";
import {
  MusicTaxonomyDraft,
  emptyMusicTaxonomyDraft,
} from "@/lib/musicTaxonomy";

type ClassificationPayload = {
  track: Record<string, unknown>;
  source: Record<string, unknown> | null;
  draft: MusicTaxonomyDraft;
  assignments: Array<Record<string, unknown>>;
  legacy: Array<Record<string, unknown>>;
  features: Record<string, unknown> | null;
  health: Record<string, unknown>;
};

async function getToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || "";
}

export default function TrackClassificationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const trackId = String(params?.id || "");
  const [classification, setClassification] = useState<ClassificationPayload | null>(null);
  const [draft, setDraft] = useState<MusicTaxonomyDraft>(emptyMusicTaxonomyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!trackId) return;
    const controller = new AbortController();
    void (async () => {
      setLoading(true);
      try {
        const token = await getToken();
        const response = await fetch(`/api/admin/music/tracks/${encodeURIComponent(trackId)}/classification`, {
          signal: controller.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = (await response.json().catch(() => null)) as { success?: boolean; classification?: ClassificationPayload; error?: string } | null;
        if (!response.ok || !data?.success || !data.classification) throw new Error(data?.error || "Failed to load classification.");
        setClassification(data.classification);
        setDraft(data.classification.draft);
        setError(null);
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Failed to load classification.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [trackId]);

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const token = await getToken();
      const response = await fetch(`/api/admin/music/tracks/${encodeURIComponent(trackId)}/classification`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ taxonomy: draft }),
      });
      const data = (await response.json().catch(() => null)) as { success?: boolean; classification?: ClassificationPayload; error?: string } | null;
      if (!response.ok || !data?.success || !data.classification) throw new Error(data?.error || "Failed to save classification.");
      setClassification(data.classification);
      setDraft(data.classification.draft);
      setNotice("Canonical classification saved. Source, rights, storage, and playback fields were not changed.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save classification.");
    } finally {
      setSaving(false);
    }
  }

  const track = classification?.track || {};
  const source = classification?.source;
  const health = classification?.health || {};
  const artwork = String(track.artwork_url || track.cover_url || "");
  const title = String(track.title || "Untitled track");
  const artist = String(track.artist || track.artist_name || "Unknown artist");

  return (
    <AdminShell
      eyebrow="Music operations"
      title={loading ? "Track classification" : title}
      description="Edit canonical music taxonomy only. This workspace never starts playback and does not change source, rights, storage, or legacy labels."
      actions={<button type="button" onClick={() => router.push("/admin/music/taxonomy")} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-white/75 hover:border-yellow-300/40">Taxonomy manager</button>}
    >
      {error ? <p className="mb-5 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p> : null}
      {notice ? <p className="mb-5 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</p> : null}

      {loading ? <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-sm text-white/55">Loading track classification…</div> : null}

      {!loading && classification ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-6">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
              {artwork ? <img src={artwork} alt="" className="h-24 w-24 rounded-2xl object-cover" /> : <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-white/[0.06] text-xs text-white/35">No art</div>}
              <div className="min-w-0"><h2 className="truncate text-2xl font-black">{title}</h2><p className="mt-1 truncate text-sm text-white/55">{artist}</p><p className="mt-2 text-xs text-white/35">Track ID: {trackId}</p></div>
            </div>

            <div className="mt-6 rounded-2xl border border-yellow-300/15 bg-yellow-300/[0.035] p-4">
              <MusicTaxonomyControls
                value={draft}
                onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
                showSource={false}
                compact
                disabled={saving}
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" disabled={saving || !draft.primaryGenreId} onClick={() => void save()} className="rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Saving…" : "Save taxonomy"}</button>
              <button type="button" disabled={saving} onClick={() => setDraft(classification.draft)} className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-black text-white/75 disabled:opacity-40">Reset changes</button>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Provenance</h2>
              <p className="mt-3 text-sm text-white/75">{source ? String(source.source_label || source.source_key) : "Not classified"}</p>
              <p className="mt-1 text-xs text-white/40">{source?.is_explicit ? "Explicit legacy source selection" : "Default/controlled source"}</p>
              <p className="mt-4 text-xs leading-5 text-white/38">Legacy storage: {String(track.source_name || "—")} · {String(track.source_type || "—")}</p>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Legacy labels</h2>
              <div className="mt-3 space-y-2">{classification.legacy.length ? classification.legacy.map((row) => <div key={String(row.id)} className="rounded-xl bg-black/20 px-3 py-2 text-xs"><span className="font-black text-white/55">{String(row.field_name)}</span><span className="ml-2 text-white/75">{String(row.raw_value)}</span></div>) : <p className="text-sm text-white/40">No raw legacy labels captured.</p>}</div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Classification health</h2>
              <div className="mt-3 space-y-2 text-sm">{[["Primary genre", Boolean(health.hasPrimaryGenre)], ["Primary mood", Boolean(health.hasPrimaryMood)], ["Accepted taxonomy", Boolean(health.hasAcceptedTaxonomy)], ["Legacy genre mapped", Boolean(health.legacyGenreMapped)], ["Legacy mood mapped", Boolean(health.legacyMoodMapped)]].map(([label, ok]) => <div key={String(label)} className="flex items-center justify-between gap-3"><span className="text-white/55">{label}</span><span className={ok ? "text-emerald-200" : "text-amber-200"}>{ok ? "Ready" : "Review"}</span></div>)}</div>
              {classification.features ? <p className="mt-4 text-xs text-white/38">Audio analysis status: {String(classification.features.analysis_status || "available")}</p> : <p className="mt-4 text-xs text-white/38">Audio features have not been analyzed.</p>}
            </section>
          </aside>
        </div>
      ) : null}
    </AdminShell>
  );
}
