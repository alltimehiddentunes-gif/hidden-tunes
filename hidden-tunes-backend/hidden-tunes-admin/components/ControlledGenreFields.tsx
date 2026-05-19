"use client";

import {
  buildNormalizedGenrePayload,
  getDefaultSubgenreId,
  getUploadMainGenres,
  getUploadSubgenres,
} from "@/lib/uploadGenreTaxonomy";

type ControlledGenreFieldsProps = {
  mainGenreId: string;
  subgenreId: string;
  onMainGenreChange: (mainGenreId: string, subgenreId: string) => void;
  onSubgenreChange: (subgenreId: string) => void;
  disabled?: boolean;
  compact?: boolean;
  helperText?: string;
  legacyGenreLabel?: string | null;
  legacyOverride?: string;
  onLegacyOverrideChange?: (value: string) => void;
};

const selectClassName =
  "w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-yellow-400 disabled:cursor-not-allowed disabled:opacity-50";

const legacyInputClassName =
  "w-full rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-3 text-sm outline-none transition placeholder:text-white/28 focus:border-amber-300/45 disabled:cursor-not-allowed disabled:opacity-50";

export default function ControlledGenreFields({
  mainGenreId,
  subgenreId,
  onMainGenreChange,
  onSubgenreChange,
  disabled = false,
  compact = false,
  helperText,
  legacyGenreLabel = null,
  legacyOverride = "",
  onLegacyOverrideChange,
}: ControlledGenreFieldsProps) {
  const mainGenres = getUploadMainGenres();
  const subgenres = getUploadSubgenres(mainGenreId);
  const preview = buildNormalizedGenrePayload({ mainGenreId, subgenreId });
  const showLegacyMappingNote =
    legacyGenreLabel &&
    preview?.genre &&
    legacyGenreLabel.trim().toLowerCase() !== preview.genre.trim().toLowerCase();

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {!compact ? (
        <p className="text-xs leading-5 text-white/45">
          Use controlled genres to keep app navigation clean and avoid duplicate
          categories.
        </p>
      ) : null}

      <label className="block space-y-2">
        <span className="text-xs font-bold uppercase tracking-widest text-white/45">
          Main Genre
        </span>
        <select
          value={mainGenreId}
          disabled={disabled}
          onChange={(event) => {
            const nextMainGenreId = event.target.value;
            const nextSubgenreId = getDefaultSubgenreId(nextMainGenreId);
            onMainGenreChange(nextMainGenreId, nextSubgenreId);
          }}
          className={selectClassName}
        >
          {mainGenres.map((genre) => (
            <option key={genre.id} value={genre.id}>
              {genre.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-2">
        <span className="text-xs font-bold uppercase tracking-widest text-white/45">
          Subgenre
        </span>
        <select
          value={subgenreId}
          disabled={disabled || !subgenres.length}
          onChange={(event) => onSubgenreChange(event.target.value)}
          className={selectClassName}
        >
          {subgenres.map((subgenre) => (
            <option key={subgenre.id} value={subgenre.id}>
              {subgenre.label}
            </option>
          ))}
        </select>
      </label>

      {preview ? (
        <p className="text-xs text-white/50">
          Catalog genre label:{" "}
          <span className="font-semibold text-yellow-200">{preview.displayLabel}</span>
        </p>
      ) : null}

      {showLegacyMappingNote ? (
        <p className="text-xs leading-5 text-white/42">
          Legacy stored label:{" "}
          <span className="font-semibold text-amber-100">{legacyGenreLabel}</span>
          {" → "}
          mapped to controlled label above.
        </p>
      ) : null}

      {onLegacyOverrideChange ? (
        <details className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-3">
          <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.16em] text-amber-100/90">
            Legacy admin override (avoid unless necessary)
          </summary>
          <label className="mt-3 block space-y-2">
            <span className="text-xs leading-5 text-white/45">
              Free-text override is inferred on save. Prefer Main Genre + Subgenre
              whenever possible.
            </span>
            <input
              value={legacyOverride}
              disabled={disabled}
              onChange={(event) => onLegacyOverrideChange(event.target.value)}
              placeholder="e.g. Afrobeat"
              className={legacyInputClassName}
            />
          </label>
        </details>
      ) : null}

      {helperText ? (
        <p className="text-xs leading-5 text-white/40">{helperText}</p>
      ) : null}
    </div>
  );
}
