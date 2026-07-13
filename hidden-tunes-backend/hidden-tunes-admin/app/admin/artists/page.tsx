"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import AdminShell from "@/components/AdminShell";
import { getActiveUploaderSession } from "@/lib/auth";
import { canUploadMusic } from "@/lib/adminPermissions";

type ArtistRow = {
  id: string;
  name: string;
  slug: string | null;
  image_url: string | null;
  status: string;
  is_verified: boolean;
  is_featured: boolean;
};

type ArtistsResponse = {
  success: boolean;
  artists?: ArtistRow[];
  pagination?: { page: number; limit: number; total: number; hasMore: boolean };
  error?: string;
};

export default function AdminArtistsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [artists, setArtists] = useState<ArtistRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const loadArtists = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const { session } = await getActiveUploaderSession();
      if (!session?.access_token) {
        router.replace("/admin/login");
        return;
      }
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      const response = await fetch(`/api/admin/artists?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = (await response.json()) as ArtistsResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to load artists.");
      }
      setArtists(payload.artists || []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load artists.");
    } finally {
      setIsLoading(false);
    }
  }, [router, search, statusFilter]);

  useEffect(() => {
    void (async () => {
      const { profile } = await getActiveUploaderSession();
      if (!profile || !canUploadMusic(profile.role)) {
        router.replace("/admin/login");
        return;
      }
      await loadArtists();
    })();
  }, [loadArtists, router]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const { session } = await getActiveUploaderSession();
      const response = await fetch("/api/admin/artists", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newName.trim(), status: "draft" }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to create artist.");
      }
      setNewName("");
      setStatusMessage(`Created artist ${payload.artist.name}.`);
      await loadArtists();
      router.push(`/admin/artists/${payload.artist.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create artist.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AdminShell
      eyebrow="Catalog"
      title="Artist Manager"
      description="Create, publish, and manage backend-driven artist profiles."
      actions={
        <button
          type="button"
          onClick={() => void loadArtists()}
          className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
        >
          Refresh
        </button>
      }
    >
      <div className="space-y-6">
        {errorMessage ? <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{errorMessage}</p> : null}
        {statusMessage ? <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{statusMessage}</p> : null}

        <form onSubmit={handleCreate} className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:grid-cols-[1fr_auto]">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="New artist name"
            className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-black disabled:opacity-60"
          >
            {creating ? "Creating..." : "Create Artist"}
          </button>
        </form>

        <div className="flex flex-wrap gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search artists"
            className="min-w-[220px] flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white outline-none"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white outline-none"
          >
            <option value="all">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="merged">Merged</option>
          </select>
          <button
            type="button"
            onClick={() => void loadArtists()}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80"
          >
            Apply
          </button>
        </div>

        {isLoading ? (
          <p className="text-white/60">Loading artists...</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <table className="min-w-full text-left text-sm text-white/80">
              <thead className="bg-white/5 text-white/55">
                <tr>
                  <th className="px-4 py-3">Artist</th>
                  <th className="px-4 py-3">Slug</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Flags</th>
                </tr>
              </thead>
              <tbody>
                {artists.map((artist) => (
                  <tr
                    key={artist.id}
                    className="cursor-pointer border-t border-white/10 hover:bg-white/5"
                    onClick={() => router.push(`/admin/artists/${artist.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {artist.image_url ? (
                          <img src={artist.image_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xs">ART</div>
                        )}
                        <span className="font-medium text-white">{artist.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{artist.slug || "—"}</td>
                    <td className="px-4 py-3 capitalize">{artist.status || "published"}</td>
                    <td className="px-4 py-3">
                      {artist.is_verified ? "Verified" : "Unverified"}
                      {artist.is_featured ? " · Featured" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {artists.length === 0 ? <p className="px-4 py-6 text-white/50">No artists found.</p> : null}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
