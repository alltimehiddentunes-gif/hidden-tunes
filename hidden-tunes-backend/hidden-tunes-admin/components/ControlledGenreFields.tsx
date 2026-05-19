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
};

const selectClassName =
  "w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-yellow-400 disabled:cursor-not-allowed disabled:opacity-50";

export default function ControlledGenreFields({
  mainGenreId,
  subgenreId,
  onMainGenreChange,
  onSubgenreChange,
  disabled = false,
  compact = false,
  helperText,
}: ControlledGenreFieldsProps) {
  const mainGenres = getUploadMainGenres();
  const subgenres = getUploadSubgenres(mainGenreId);
  const preview = buildNormalizedGenrePayload({ mainGenreId, subgenreId });

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

      {helperText ? (
        <p className="text-xs leading-5 text-white/40">{helperText}</p>
      ) : null}
    </div>
  );
}
