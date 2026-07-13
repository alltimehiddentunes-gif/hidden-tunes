"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import AdminShell from "@/components/AdminShell";
import { getActiveUploaderSession } from "@/lib/auth";
import { canUploadMusic } from "@/lib/adminPermissions";

type ArtistDetail = {
  artist: Record<string, unknown>;
  genres: Array<{ genre: string }>;
  sections: Array<Record<string, unknown>>;
  statistics: Record<string, unknown> | null;
  rights: Record<string, unknown> | null;
  claims: Array<Record<string, unknown>>;
  biography: Array<Record<string, unknown>>;
  links: Array<Record<string, unknown>>;
  images: Array<Record<string, unknown>>;
};

export default function AdminArtistDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const artistId = String(params.id || "");
  const [detail, setDetail] = useState<ArtistDetail | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    slug: "",
    bio: "",
    status: "draft",
    is_verified: false,
    is_featured: false,
    explicit_rating: "unknown",
    website_url: "",
    hometown: "",
    country_code: "",
  });
  const [genresText, setGenresText] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const authFetch = useCallback(async (input: string, init?: RequestInit) => {
    const { session } = await getActiveUploaderSession();
    return fetch(input, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${session?.access_token || ""}`,
        "Content-Type": "application/json",
      },
    });
  }, []);

  const loadDetail = useCallback(async () => {
    setErrorMessage(null);
    const response = await authFetch(`/api/admin/artists/${artistId}`);
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "Failed to load artist.");
    }
    setDetail(payload as ArtistDetail);
    const artist = payload.artist as Record<string, unknown>;
    setDraft({
      name: String(artist.name || ""),
      slug: String(artist.slug || ""),
      bio: String(artist.bio || ""),
      status: String(artist.status || "draft"),
      is_verified: artist.is_verified === true,
      is_featured: artist.is_featured === true,
      explicit_rating: String(artist.explicit_rating || "unknown"),
      website_url: String(artist.website_url || ""),
      hometown: String(artist.hometown || ""),
      country_code: String(artist.country_code || ""),
    });
    setGenresText((payload.genres || []).map((row: { genre: string }) => row.genre).join(", "));
  }, [artistId, authFetch]);

  useEffect(() => {
    void (async () => {
      const { profile } = await getActiveUploaderSession();
      if (!profile || !canUploadMusic(profile.role)) {
        router.replace("/admin/login");
        return;
      }
      try {
        await loadDetail();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load artist.");
      }
    })();
  }, [loadDetail, router]);

  async function saveArtist(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const response = await authFetch(`/api/admin/artists/${artistId}`, {
        method: "PATCH",
        body: JSON.stringify(draft),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Save failed.");
      await authFetch(`/api/admin/artists/${artistId}/genres`, {
        method: "PUT",
        body: JSON.stringify({ genres: genresText.split(",").map((g) => g.trim()).filter(Boolean) }),
      });
      setStatusMessage("Artist profile saved.");
      await loadDetail();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function refreshStatistics() {
    const response = await authFetch(`/api/admin/artists/${artistId}/statistics/refresh`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      setErrorMessage(payload.error || "Failed to refresh statistics.");
      return;
    }
    setStatusMessage("Statistics refreshed.");
    await loadDetail();
  }

  async function uploadImage() {
    if (!imageUrl.trim()) return;
    const response = await authFetch(`/api/admin/artists/${artistId}/images`, {
      method: "POST",
      body: JSON.stringify({ image_url: imageUrl.trim(), is_primary: true }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      setErrorMessage(payload.error || "Failed to save image.");
      return;
    }
    setImageUrl("");
    setStatusMessage("Artist image updated.");
    await loadDetail();
  }

  async function mergeArtist() {
    if (!mergeTargetId.trim()) return;
    const response = await authFetch(`/api/admin/artists/${artistId}/merge`, {
      method: "POST",
      body: JSON.stringify({ target_artist_id: mergeTargetId.trim() }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      setErrorMessage(payload.error || "Merge failed.");
      return;
    }
    setStatusMessage("Artist merged.");
    router.push(`/admin/artists/${mergeTargetId.trim()}`);
  }

  return (
    <AdminShell
      eyebrow="Artist Manager"
      title={draft.name || "Artist Profile"}
      description="Edit identity, publishing state, genres, images, statistics, and merges."
      actions={
        <button type="button" onClick={() => router.push("/admin/artists")} className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80">
          Back to list
        </button>
      }
    >
      <div className="space-y-6">
        {errorMessage ? <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{errorMessage}</p> : null}
        {statusMessage ? <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{statusMessage}</p> : null}

        <form onSubmit={saveArtist} className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm text-white/60">Name</span>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white" />
          </label>
          <label className="space-y-2">
            <span className="text-sm text-white/60">Slug</span>
            <input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white" />
          </label>
          <label className="md:col-span-2 space-y-2">
            <span className="text-sm text-white/60">Bio</span>
            <textarea value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} rows={4} className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white" />
          </label>
          <label className="space-y-2">
            <span className="text-sm text-white/60">Status</span>
            <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm text-white/60">Explicit rating</span>
            <select value={draft.explicit_rating} onChange={(e) => setDraft({ ...draft, explicit_rating: e.target.value })} className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white">
              <option value="unknown">Unknown</option>
              <option value="clean">Clean</option>
              <option value="explicit">Explicit</option>
            </select>
          </label>
          <label className="md:col-span-2 space-y-2">
            <span className="text-sm text-white/60">Genres (comma separated)</span>
            <input value={genresText} onChange={(e) => setGenresText(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white" />
          </label>
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" checked={draft.is_verified} onChange={(e) => setDraft({ ...draft, is_verified: e.target.checked })} />
            Verified
          </label>
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" checked={draft.is_featured} onChange={(e) => setDraft({ ...draft, is_featured: e.target.checked })} />
            Featured
          </label>
          <div className="md:col-span-2">
            <button type="submit" disabled={saving} className="rounded-xl bg-white px-5 py-3 text-sm font-medium text-black disabled:opacity-60">
              {saving ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </form>

        {detail?.statistics ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-medium text-white">Statistics</h2>
              <button type="button" onClick={() => void refreshStatistics()} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80">
                Refresh
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(detail.statistics).map(([key, value]) => (
                <div key={key} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-white/45">{key.replace(/_/g, " ")}</p>
                  <p className="mt-1 text-lg text-white">{String(value)}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="mb-3 text-lg font-medium text-white">Primary image</h2>
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Image URL" className="mb-3 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white" />
            <button type="button" onClick={() => void uploadImage()} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80">
              Set primary image
            </button>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="mb-3 text-lg font-medium text-white">Merge duplicate</h2>
            <input value={mergeTargetId} onChange={(e) => setMergeTargetId(e.target.value)} placeholder="Target artist UUID" className="mb-3 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white" />
            <button type="button" onClick={() => void mergeArtist()} className="rounded-xl border border-red-400/30 px-4 py-2 text-sm text-red-100">
              Merge into target
            </button>
          </div>
        </div>

        {detail?.claims?.length ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="mb-3 text-lg font-medium text-white">Pending claims</h2>
            <ul className="space-y-2 text-sm text-white/75">
              {detail.claims.map((claim) => (
                <li key={String(claim.id)} className="rounded-xl border border-white/10 px-4 py-3">
                  Claim {String(claim.id)} · {String(claim.status)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
