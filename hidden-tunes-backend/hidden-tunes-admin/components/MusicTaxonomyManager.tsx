"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/auth";
import {
  MUSIC_TAXONOMY_TYPES,
  MusicTaxonomyTerm,
  MusicTaxonomyType,
} from "@/lib/musicTaxonomy";

type Alias = { id: string; alias: string; normalized_alias: string };
type Pagination = { page: number; pageSize: number; total: number; totalPages: number };
type Health = {
  termCount: number;
  assignmentCount: number;
  classifiedTrackCount: number;
  legacyLabelTrackCount: number;
  unmappedLegacyTrackCount: number;
  sourceCount: number;
  termsByType: Record<string, number>;
  termsByStatus: Record<string, number>;
};

const inputClass =
  "w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm outline-none transition focus:border-yellow-300/60";
const buttonClass =
  "rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-black text-white/75 transition hover:border-yellow-300/40 disabled:cursor-not-allowed disabled:opacity-40";

async function adminFetch(path: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers = new Headers(init?.headers);
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(path, { ...init, headers });
}

function emptyTermForm() {
  return {
    taxonomyType: "GENRE" as MusicTaxonomyType,
    name: "",
    slug: "",
    parentId: "",
    region: "",
    description: "",
    status: "ACTIVE",
    sortOrder: "0",
  };
}

export default function MusicTaxonomyManager() {
  const [terms, setTerms] = useState<MusicTaxonomyTerm[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [createForm, setCreateForm] = useState(emptyTermForm);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [aliasInput, setAliasInput] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedTerm = terms.find((term) => term.id === selectedId) || null;

  function editFormForTerm(term: MusicTaxonomyTerm) {
    return {
      name: term.name,
      slug: term.slug,
      parentId: term.parent_id || "",
      region: term.region || "",
      description: term.description || "",
      status: term.status === "MERGED" ? "MERGED" : term.status,
      sortOrder: String(term.sort_order),
    };
  }

  const loadTerms = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "50" });
      if (query.trim()) params.set("q", query.trim());
      if (typeFilter) params.set("type", typeFilter);
      if (statusFilter) params.set("status", statusFilter);
      const response = await adminFetch(`/api/admin/music/taxonomy?${params.toString()}`);
      const data = (await response.json().catch(() => null)) as { success?: boolean; terms?: MusicTaxonomyTerm[]; pagination?: Pagination; error?: string } | null;
      if (!response.ok || !data?.success) throw new Error(data?.error || "Failed to load taxonomy terms.");
      setTerms(data.terms || []);
      setPagination(data.pagination || null);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load taxonomy terms.");
    }
  }, [page, query, statusFilter, typeFilter]);

  const loadHealth = useCallback(async () => {
    const response = await adminFetch("/api/admin/music/taxonomy/health");
    const data = (await response.json().catch(() => null)) as { success?: boolean; health?: Health; error?: string } | null;
    if (response.ok && data?.success) setHealth(data.health || null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTerms();
      void loadHealth();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadHealth, loadTerms]);

  async function selectTerm(term: MusicTaxonomyTerm) {
    setSelectedId(term.id);
    setEditForm(editFormForTerm(term));
    setAliases([]);
    setAliasInput("");
    try {
      const response = await adminFetch(`/api/admin/music/taxonomy/${term.id}/aliases`);
      const data = (await response.json().catch(() => null)) as { success?: boolean; aliases?: Alias[] } | null;
      if (response.ok && data?.success) setAliases(data.aliases || []);
    } catch {
      setAliases([]);
    }
  }

  const parentOptions = useMemo(
    () => terms.filter((term) => term.id !== selectedId && term.status === "ACTIVE"),
    [selectedId, terms]
  );

  async function createTerm() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await adminFetch("/api/admin/music/taxonomy", {
        method: "POST",
        body: JSON.stringify(createForm),
      });
      const data = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!response.ok || !data?.success) throw new Error(data?.error || "Failed to create taxonomy term.");
      setCreateForm(emptyTermForm());
      setNotice("Taxonomy term created.");
      await loadTerms();
      await loadHealth();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create taxonomy term.");
    } finally {
      setBusy(false);
    }
  }

  async function saveTerm() {
    if (!selectedTerm) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await adminFetch(`/api/admin/music/taxonomy/${selectedTerm.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name,
          slug: editForm.slug,
          parentId: editForm.parentId || null,
          region: editForm.region,
          description: editForm.description,
          status: editForm.status === "MERGED" ? "DEPRECATED" : editForm.status,
          sortOrder: Number(editForm.sortOrder || 0),
        }),
      });
      const data = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!response.ok || !data?.success) throw new Error(data?.error || "Failed to save taxonomy term.");
      setNotice("Taxonomy term updated.");
      await loadTerms();
      await loadHealth();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save taxonomy term.");
    } finally {
      setBusy(false);
    }
  }

  async function addAlias() {
    if (!selectedTerm || !aliasInput.trim()) return;
    setBusy(true);
    try {
      const response = await adminFetch(`/api/admin/music/taxonomy/${selectedTerm.id}/aliases`, {
        method: "POST",
        body: JSON.stringify({ alias: aliasInput.trim() }),
      });
      const data = (await response.json().catch(() => null)) as { success?: boolean; aliases?: Alias[]; alias?: Alias; error?: string } | null;
      if (!response.ok || !data?.success) throw new Error(data?.error || "Failed to create alias.");
      setAliasInput("");
      setAliases((current) => [...current, ...(data.alias ? [data.alias] : [])]);
      setNotice("Alias added.");
    } catch (aliasError) {
      setError(aliasError instanceof Error ? aliasError.message : "Failed to create alias.");
    } finally {
      setBusy(false);
    }
  }

  async function removeAlias(aliasId: string) {
    if (!selectedTerm) return;
    setBusy(true);
    try {
      const response = await adminFetch(`/api/admin/music/taxonomy/${selectedTerm.id}/aliases?aliasId=${encodeURIComponent(aliasId)}`, { method: "DELETE" });
      const data = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!response.ok || !data?.success) throw new Error(data?.error || "Failed to delete alias.");
      setAliases((current) => current.filter((alias) => alias.id !== aliasId));
    } catch (aliasError) {
      setError(aliasError instanceof Error ? aliasError.message : "Failed to delete alias.");
    } finally {
      setBusy(false);
    }
  }

  async function mergeTerm() {
    if (!selectedTerm || !mergeTargetId) return;
    setBusy(true);
    try {
      const response = await adminFetch(`/api/admin/music/taxonomy/${selectedTerm.id}/merge`, {
        method: "POST",
        body: JSON.stringify({ targetTermId: mergeTargetId }),
      });
      const data = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!response.ok || !data?.success) throw new Error(data?.error || "Failed to merge term.");
      setMergeTargetId("");
      setNotice("Term merged safely; assignments and aliases were redirected.");
      await loadTerms();
      await loadHealth();
    } catch (mergeError) {
      setError(mergeError instanceof Error ? mergeError.message : "Failed to merge term.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {error ? <p className="rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p> : null}
      {notice ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</p> : null}

      {health ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Terms", health.termCount],
            ["Accepted assignments", health.assignmentCount],
            ["Classified tracks", health.classifiedTrackCount],
            ["Legacy-label tracks", health.legacyLabelTrackCount],
            ["Unmapped legacy", health.unmappedLegacyTrackCount],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-2xl font-black">{value}</p>
              <p className="mt-1 text-xs text-white/45">{label}</p>
            </div>
          ))}
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,430px)]">
        <div className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_150px_auto]">
            <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search canonical terms" className={inputClass} />
            <select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }} className={inputClass}>
              <option value="">All families</option>
              {MUSIC_TAXONOMY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className={inputClass}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="HIDDEN">Hidden</option>
              <option value="DEPRECATED">Deprecated</option>
              <option value="MERGED">Merged</option>
            </select>
            <button type="button" onClick={() => { void loadTerms(); void loadHealth(); }} className={buttonClass}>Refresh</button>
          </div>

          <div className="mt-4 space-y-2">
            {terms.map((term) => (
              <button
                type="button"
                key={term.id}
                onClick={() => void selectTerm(term)}
                className={`flex w-full min-w-0 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${selectedId === term.id ? "border-yellow-300/40 bg-yellow-300/[0.08]" : "border-white/10 bg-black/20 hover:border-white/25"}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black">{term.name}</span>
                  <span className="mt-1 block truncate text-xs text-white/38">{term.taxonomy_type} · {term.slug}{term.parent_id ? " · nested" : ""}</span>
                </span>
                <span className="shrink-0 text-right text-[10px] font-black uppercase tracking-widest text-white/35">
                  {term.status}<br />{term.assignment_count ?? 0} uses
                </span>
              </button>
            ))}
            {!terms.length ? <p className="rounded-2xl border border-white/10 px-4 py-8 text-center text-sm text-white/45">No terms match the current filters.</p> : null}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-white/45">
            <span>{pagination ? `${pagination.total} total terms · page ${pagination.page} of ${pagination.totalPages}` : ""}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className={buttonClass}>Previous</button>
              <button type="button" disabled={!pagination || page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)} className={buttonClass}>Next</button>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <section className="rounded-3xl border border-yellow-300/15 bg-yellow-300/[0.035] p-4 sm:p-5">
            <h2 className="text-lg font-black">Add controlled term</h2>
            <div className="mt-4 space-y-3">
              <select value={createForm.taxonomyType} onChange={(event) => setCreateForm((current) => ({ ...current, taxonomyType: event.target.value as MusicTaxonomyType }))} className={inputClass}>
                {MUSIC_TAXONOMY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <input value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} placeholder="Name" className={inputClass} />
              <input value={createForm.slug} onChange={(event) => setCreateForm((current) => ({ ...current, slug: event.target.value }))} placeholder="Slug (optional)" className={inputClass} />
              <input value={createForm.parentId} onChange={(event) => setCreateForm((current) => ({ ...current, parentId: event.target.value }))} placeholder="Parent term ID (optional)" className={inputClass} />
              <input value={createForm.region} onChange={(event) => setCreateForm((current) => ({ ...current, region: event.target.value }))} placeholder="Region (optional)" className={inputClass} />
              <textarea value={createForm.description} onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description (optional)" rows={3} className={inputClass} />
              <button type="button" disabled={busy || !createForm.name.trim()} onClick={() => void createTerm()} className="w-full rounded-xl bg-yellow-300 px-3 py-3 text-sm font-black text-black disabled:opacity-40">Create term</button>
            </div>
          </section>

          {selectedTerm ? (
            <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><h2 className="truncate text-lg font-black">Edit {selectedTerm.name}</h2><p className="mt-1 text-xs text-white/40">{selectedTerm.taxonomy_type} · {selectedTerm.assignment_count ?? 0} assignments</p></div>
                <button type="button" onClick={() => { setSelectedId(""); setEditForm({}); setAliases([]); }} className={buttonClass}>Close</button>
              </div>
              <div className="mt-4 space-y-3">
                <input value={editForm.name || ""} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} placeholder="Name" className={inputClass} />
                <input value={editForm.slug || ""} onChange={(event) => setEditForm((current) => ({ ...current, slug: event.target.value }))} placeholder="Slug" className={inputClass} />
                <input value={editForm.parentId || ""} onChange={(event) => setEditForm((current) => ({ ...current, parentId: event.target.value }))} placeholder="Parent term ID; blank for root" className={inputClass} />
                {parentOptions.length ? <p className="text-[11px] leading-4 text-white/35">Available parent IDs on this page: {parentOptions.slice(0, 8).map((term) => `${term.name} (${term.id})`).join(" · ")}</p> : null}
                <div className="grid gap-3 sm:grid-cols-2"><input value={editForm.region || ""} onChange={(event) => setEditForm((current) => ({ ...current, region: event.target.value }))} placeholder="Region" className={inputClass} /><input value={editForm.sortOrder || "0"} onChange={(event) => setEditForm((current) => ({ ...current, sortOrder: event.target.value }))} type="number" placeholder="Sort order" className={inputClass} /></div>
                <select value={editForm.status || "ACTIVE"} onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value }))} className={inputClass}><option value="ACTIVE">Active</option><option value="HIDDEN">Hidden</option><option value="DEPRECATED">Deprecated</option></select>
                <textarea value={editForm.description || ""} onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description" rows={3} className={inputClass} />
                <button type="button" disabled={busy} onClick={() => void saveTerm()} className="w-full rounded-xl bg-white px-3 py-3 text-sm font-black text-black disabled:opacity-40">Save term</button>
              </div>

              <div className="mt-5 border-t border-white/10 pt-5">
                <h3 className="text-sm font-black">Aliases</h3>
                <div className="mt-3 flex gap-2"><input value={aliasInput} onChange={(event) => setAliasInput(event.target.value)} placeholder="R&B, DnB, Kompa…" className={inputClass} /><button type="button" disabled={busy || !aliasInput.trim()} onClick={() => void addAlias()} className={buttonClass}>Add</button></div>
                <div className="mt-3 flex flex-wrap gap-2">{aliases.map((alias) => <span key={alias.id} className="flex items-center gap-2 rounded-full bg-white/[0.07] px-3 py-1 text-xs text-white/70">{alias.alias}<button type="button" onClick={() => void removeAlias(alias.id)} className="text-white/35 hover:text-red-200" aria-label={`Remove ${alias.alias}`}>×</button></span>)}</div>
              </div>

              <div className="mt-5 border-t border-white/10 pt-5">
                <h3 className="text-sm font-black text-amber-100">Merge safely</h3>
                <p className="mt-1 text-xs leading-5 text-white/40">Assignments and aliases move to the target. This term remains as a MERGED history record.</p>
                <select value={mergeTargetId} onChange={(event) => setMergeTargetId(event.target.value)} className={`mt-3 ${inputClass}`}><option value="">Choose a target term</option>{terms.filter((term) => term.id !== selectedTerm.id && term.taxonomy_type === selectedTerm.taxonomy_type && term.status === "ACTIVE").map((term) => <option key={term.id} value={term.id}>{term.name} · {term.slug}</option>)}</select>
                <button type="button" disabled={busy || !mergeTargetId} onClick={() => void mergeTerm()} className="mt-3 w-full rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-3 text-sm font-black text-amber-100 disabled:opacity-40">Merge selected term</button>
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}
