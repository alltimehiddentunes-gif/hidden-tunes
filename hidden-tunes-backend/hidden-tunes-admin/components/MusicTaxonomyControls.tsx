"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import {
  MusicSourceKey,
  MusicTaxonomyDraft,
  MusicTaxonomyTerm,
  emptyMusicTaxonomyDraft,
} from "@/lib/musicTaxonomy";

type TermOption = Pick<MusicTaxonomyTerm, "id" | "name" | "slug" | "taxonomy_type" | "parent_id">;

let cachedTerms: MusicTaxonomyTerm[] | null = null;
let termsRequest: Promise<MusicTaxonomyTerm[]> | null = null;

function loadMusicTaxonomyTerms() {
  if (cachedTerms) return Promise.resolve(cachedTerms);
  if (!termsRequest) {
    termsRequest = fetch("/api/music/taxonomy")
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as { success?: boolean; terms?: MusicTaxonomyTerm[]; error?: string } | null;
        if (!response.ok || !data?.success) throw new Error(data?.error || "Controlled taxonomy is unavailable.");
        cachedTerms = Array.isArray(data.terms) ? data.terms : [];
        return cachedTerms;
      })
      .finally(() => {
        termsRequest = null;
      });
  }
  return termsRequest;
}

type SearchableTaxonomySelectProps = {
  label: string;
  options: TermOption[];
  value: string | string[];
  multiple?: boolean;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
  loading?: boolean;
  error?: string | null;
  onChange: (value: string | string[]) => void;
};

const selectShell =
  "rounded-2xl border border-white/10 bg-black/35 px-3 py-3 text-sm outline-none transition focus-within:border-yellow-300/60";

function SearchableTaxonomySelect({
  label,
  options,
  value,
  multiple = false,
  required = false,
  disabled = false,
  helperText,
  loading = false,
  error,
  onChange,
}: SearchableTaxonomySelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedIds = multiple ? (value as string[]) : value ? [value as string] : [];
  const selectedOption = !multiple
    ? options.find((option) => option.id === selectedIds[0])
    : null;

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const visible = normalized
      ? options.filter((option) =>
          `${option.name} ${option.slug}`.toLowerCase().includes(normalized)
        )
      : options;
    return visible.slice(0, 60);
  }, [options, query]);

  function closeWhenBlurred() {
    window.setTimeout(() => {
      if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
    }, 0);
  }

  function choose(option: TermOption) {
    if (multiple) {
      const next = selectedIds.includes(option.id)
        ? selectedIds.filter((id) => id !== option.id)
        : [...selectedIds, option.id];
      onChange(next);
      setQuery("");
      setOpen(true);
      return;
    }

    onChange(option.id);
    setQuery("");
    setOpen(false);
  }

  function clear() {
    onChange(multiple ? [] : "");
    setQuery("");
  }

  function selectAllVisible() {
    if (!multiple) return;
    const visibleIds = filtered.map((option) => option.id);
    onChange(Array.from(new Set([...selectedIds, ...visibleIds])));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlighted((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && open && filtered[highlighted]) {
      event.preventDefault();
      choose(filtered[highlighted]);
    } else if (event.key === "Escape") {
      setOpen(false);
    } else if (event.key === "Backspace" && multiple && !query && selectedIds.length) {
      onChange(selectedIds.slice(0, -1));
    }
  }

  return (
    <div ref={rootRef} className="relative space-y-1.5" onBlur={closeWhenBlurred}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-bold uppercase tracking-widest text-white/48">
          {label} {required ? <span className="text-yellow-300">*</span> : null}
        </label>
        {multiple && selectedIds.length ? (
          <button type="button" onClick={clear} className="text-[10px] font-black uppercase tracking-widest text-white/38 hover:text-white">
            Clear
          </button>
        ) : null}
      </div>

      <div className={selectShell}>
        {multiple && selectedIds.length ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selectedIds.map((id) => {
              const option = options.find((candidate) => candidate.id === id);
              return (
                <button
                  key={id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(selectedIds.filter((selectedId) => selectedId !== id))}
                  className="max-w-full rounded-full bg-yellow-300/15 px-2.5 py-1 text-left text-xs font-bold text-yellow-100 disabled:opacity-50"
                  title="Remove"
                >
                  {option?.name || id} ×
                </button>
              );
            })}
          </div>
        ) : null}

        <input
          value={multiple || open ? query : selectedOption?.name || ""}
          disabled={disabled}
          onFocus={() => {
            setQuery("");
            setHighlighted(0);
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlighted(0);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={multiple ? "Search and select…" : "Search taxonomy…"}
          className="w-full bg-transparent text-sm outline-none placeholder:text-white/28 disabled:cursor-not-allowed"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          role="combobox"
        />
      </div>

      {open && !disabled ? (
        <div id={listboxId} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-2xl border border-white/15 bg-[#15151d] p-1 shadow-2xl">
          {multiple && filtered.length ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={selectAllVisible}
              className="w-full rounded-xl px-3 py-2 text-left text-xs font-black uppercase tracking-widest text-yellow-200 hover:bg-white/[0.08]"
            >
              Select all {query ? "matching" : "visible"}
            </button>
          ) : null}
          {loading ? <p className="px-3 py-3 text-xs text-white/45">Loading controlled terms…</p> : null}
          {!loading && error ? <p className="px-3 py-3 text-xs text-amber-200">{error}</p> : null}
          {!loading && !error && !filtered.length ? <p className="px-3 py-3 text-xs text-white/45">No controlled terms match.</p> : null}
          {!loading && !error
            ? filtered.map((option, index) => {
                const selected = selectedIds.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(option)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                      highlighted === index ? "bg-white/[0.1]" : "hover:bg-white/[0.07]"
                    } ${selected ? "text-yellow-100" : "text-white/80"}`}
                  >
                    <span className="min-w-0 truncate">{option.name}</span>
                    <span className="shrink-0 text-[10px] uppercase tracking-widest text-white/30">
                      {selected ? "Selected" : option.slug}
                    </span>
                  </button>
                );
              })
            : null}
        </div>
      ) : null}

      {helperText ? <p className="text-[11px] leading-4 text-white/35">{helperText}</p> : null}
    </div>
  );
}

export type MusicTaxonomyControlsProps = {
  value: MusicTaxonomyDraft;
  onChange: (patch: Partial<MusicTaxonomyDraft>) => void;
  sourceKey?: MusicSourceKey;
  sourceExplicit?: boolean;
  onSourceChange?: (sourceKey: MusicSourceKey, explicit: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
  showSource?: boolean;
  autoSelectDefaultPrimaryGenre?: boolean;
};

export default function MusicTaxonomyControls({
  value,
  onChange,
  sourceKey = "mureka",
  sourceExplicit = false,
  onSourceChange,
  disabled = false,
  compact = false,
  showSource = true,
  autoSelectDefaultPrimaryGenre = false,
}: MusicTaxonomyControlsProps) {
  const [terms, setTerms] = useState<MusicTaxonomyTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const nextTerms = await loadMusicTaxonomyTerms();
        if (controller.signal.aborted) return;
        setTerms(nextTerms);
        setError(null);
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Controlled taxonomy is unavailable.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  const byType = useMemo(() => {
    const result = new Map<string, TermOption[]>();
    terms.forEach((term) => {
      const list = result.get(term.taxonomy_type) || [];
      list.push(term);
      result.set(term.taxonomy_type, list);
    });
    return result;
  }, [terms]);

  useEffect(() => {
    if (!autoSelectDefaultPrimaryGenre || value.primaryGenreId || !terms.length) return;
    const preferred = terms.find(
      (term) => term.taxonomy_type === "GENRE" && term.slug === "afrobeats"
    );
    const fallback = terms.find((term) => term.taxonomy_type === "GENRE");
    if (preferred || fallback) onChange({ primaryGenreId: (preferred || fallback)!.id });
  }, [autoSelectDefaultPrimaryGenre, onChange, terms, value.primaryGenreId]);

  const termOptions = (type: MusicTaxonomyTerm["taxonomy_type"]) => byType.get(type) || [];
  const spacing = compact ? "space-y-3" : "space-y-4";

  return (
    <div className={spacing}>
      {showSource && onSourceChange ? (
        <div className="rounded-2xl border border-yellow-300/15 bg-yellow-300/[0.04] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-yellow-100/90">Music source</p>
              <p className="mt-1 text-[11px] leading-4 text-white/40">Provenance only; storage and rights fields remain unchanged.</p>
            </div>
            <select
              value={sourceKey}
              disabled={disabled}
              onChange={(event) => {
                const next = event.target.value === "djcity" ? "djcity" : "mureka";
                onSourceChange(next, next === "djcity" ? sourceExplicit : false);
              }}
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-yellow-300"
            >
              <option value="mureka">Mureka (default)</option>
              <option value="djcity">DJcity (legacy, explicit)</option>
            </select>
          </div>
          {sourceKey === "djcity" ? (
            <label className="mt-3 flex items-center gap-2 text-xs text-amber-100">
              <input
                type="checkbox"
                checked={sourceExplicit}
                disabled={disabled}
                onChange={(event) => onSourceChange("djcity", event.target.checked)}
              />
              I explicitly confirm this legacy DJcity source.
            </label>
          ) : null}
        </div>
      ) : null}

      <SearchableTaxonomySelect
        label="Primary genre"
        required
        options={termOptions("GENRE")}
        value={value.primaryGenreId}
        disabled={disabled}
        loading={loading}
        error={error}
        onChange={(next) => onChange({ primaryGenreId: String(next) })}
      />

      <SearchableTaxonomySelect
        label="Secondary genres"
        options={termOptions("GENRE")}
        value={value.secondaryGenreIds}
        multiple
        disabled={disabled}
        loading={loading}
        error={error}
        onChange={(next) => onChange({ secondaryGenreIds: next as string[] })}
      />

      <SearchableTaxonomySelect
        label="Primary subgenre"
        options={termOptions("SUBGENRE")}
        value={value.primarySubgenreId}
        disabled={disabled}
        loading={loading}
        error={error}
        onChange={(next) => onChange({ primarySubgenreId: String(next) })}
      />

      <SearchableTaxonomySelect
        label="Subgenres"
        options={termOptions("SUBGENRE")}
        value={value.subgenreIds}
        multiple
        disabled={disabled}
        loading={loading}
        error={error}
        onChange={(next) => onChange({ subgenreIds: next as string[] })}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <SearchableTaxonomySelect label="Regional styles" options={termOptions("REGIONAL_STYLE")} value={value.regionalStyleIds} multiple disabled={disabled} loading={loading} error={error} onChange={(next) => onChange({ regionalStyleIds: next as string[] })} />
        <SearchableTaxonomySelect label="Cultural styles" options={termOptions("CULTURAL_STYLE")} value={value.culturalStyleIds} multiple disabled={disabled} loading={loading} error={error} onChange={(next) => onChange({ culturalStyleIds: next as string[] })} />
        <SearchableTaxonomySelect label="Moods" options={termOptions("MOOD")} value={value.moodIds} multiple disabled={disabled} loading={loading} error={error} onChange={(next) => onChange({ moodIds: next as string[] })} />
        <SearchableTaxonomySelect label="Activities" options={termOptions("ACTIVITY")} value={value.activityIds} multiple disabled={disabled} loading={loading} error={error} onChange={(next) => onChange({ activityIds: next as string[] })} />
        <SearchableTaxonomySelect label="Themes" options={termOptions("THEME")} value={value.themeIds} multiple disabled={disabled} loading={loading} error={error} onChange={(next) => onChange({ themeIds: next as string[] })} />
        <SearchableTaxonomySelect label="Languages" options={termOptions("LANGUAGE")} value={value.languageIds} multiple disabled={disabled} loading={loading} error={error} onChange={(next) => onChange({ languageIds: next as string[] })} />
        <SearchableTaxonomySelect label="Vocals" options={termOptions("VOCAL_STYLE")} value={value.vocalStyleIds} multiple disabled={disabled} loading={loading} error={error} onChange={(next) => onChange({ vocalStyleIds: next as string[] })} />
        <SearchableTaxonomySelect label="Instrumentation" options={termOptions("INSTRUMENT")} value={value.instrumentIds} multiple disabled={disabled} loading={loading} error={error} onChange={(next) => onChange({ instrumentIds: next as string[] })} />
        <SearchableTaxonomySelect label="Era" options={termOptions("ERA")} value={value.eraId} disabled={disabled} loading={loading} error={error} onChange={(next) => onChange({ eraId: String(next) })} />
        <SearchableTaxonomySelect label="Tempo class" options={termOptions("TEMPO_CLASS")} value={value.tempoClassId} disabled={disabled} loading={loading} error={error} onChange={(next) => onChange({ tempoClassId: String(next) })} />
      </div>

      {!loading && !error && !value.primaryGenreId ? (
        <p className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-100">
          Select a primary genre before uploading. The canonical list keeps Afrobeat and Afrobeats separate.
        </p>
      ) : null}
    </div>
  );
}

export function createEmptyMusicTaxonomyDraft() {
  return emptyMusicTaxonomyDraft();
}
