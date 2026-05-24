"use client";

import { useEffect, useMemo, useState } from "react";

import {
  DEFAULT_BULK_AUTO_TIMESTAMP_OPTIONS,
  generateBulkAutoTimestampPreview,
  type BulkAutoTimestampPreview,
} from "@/lib/bulkAutoTimestamp";
import type { BulkLyricsMatchedRow } from "@/lib/bulkLyricsIntake";
import type { CreatorLyricsCatalogTrack } from "@/lib/creatorLyricsCatalog";

type BulkAutoTimestampPanelProps = {
  row: BulkLyricsMatchedRow;
  track: CreatorLyricsCatalogTrack | null;
  onClose: () => void;
  onConfirm: (generatedLrc: string) => void;
};

export default function BulkAutoTimestampPanel({
  row,
  track,
  onClose,
  onConfirm,
}: BulkAutoTimestampPanelProps) {
  const [globalOffsetSeconds, setGlobalOffsetSeconds] = useState(
    DEFAULT_BULK_AUTO_TIMESTAMP_OPTIONS.globalOffsetSeconds
  );
  const [introSeconds, setIntroSeconds] = useState(
    DEFAULT_BULK_AUTO_TIMESTAMP_OPTIONS.introSeconds
  );
  const [outroSeconds, setOutroSeconds] = useState(
    DEFAULT_BULK_AUTO_TIMESTAMP_OPTIONS.outroSeconds
  );
  const [spacingIntensity, setSpacingIntensity] = useState(
    DEFAULT_BULK_AUTO_TIMESTAMP_OPTIONS.spacingIntensity
  );

  const preview = useMemo<BulkAutoTimestampPreview>(() => {
    return generateBulkAutoTimestampPreview({
      plainLyrics: row.block.content,
      durationSeconds: track?.durationSeconds ?? 0,
      globalOffsetSeconds,
      introSeconds,
      outroSeconds,
      spacingIntensity,
    });
  }, [
    globalOffsetSeconds,
    introSeconds,
    outroSeconds,
    row.block.content,
    spacingIntensity,
    track?.durationSeconds,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const canConfirm = Boolean(preview.generatedLrc.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/78 px-4 py-6 backdrop-blur-xl">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#101017] shadow-2xl">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-300">
            Auto Timestamp Pro
          </p>
          <h2 className="mt-2 text-2xl font-black text-white">
            {track?.trackTitle || row.block.sourceLabel}
          </h2>
          <p className="mt-1 text-sm text-white/45">
            {track?.artistName || row.block.artistHint || "Unknown artist"} ·{" "}
            {track?.albumTitle || row.block.albumHint || "Unknown album"}
            {track?.durationSeconds
              ? ` · ${formatDuration(track.durationSeconds)}`
              : " · duration estimated"}
          </p>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-6 py-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <aside className="flex flex-col gap-4">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-xs font-black uppercase tracking-widest text-white/38">
                Timing controls
              </p>

              <label className="mt-4 block">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/35">
                  Global offset (sec)
                </span>
                <input
                  type="number"
                  step="0.5"
                  value={globalOffsetSeconds}
                  onChange={(event) =>
                    setGlobalOffsetSeconds(Number(event.target.value) || 0)
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-violet-300/35"
                />
              </label>

              <label className="mt-3 block">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/35">
                  Intro (sec)
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={introSeconds}
                  onChange={(event) =>
                    setIntroSeconds(Math.max(0, Number(event.target.value) || 0))
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-violet-300/35"
                />
              </label>

              <label className="mt-3 block">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/35">
                  Outro padding (sec)
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={outroSeconds}
                  onChange={(event) =>
                    setOutroSeconds(Math.max(0, Number(event.target.value) || 0))
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-violet-300/35"
                />
              </label>

              <label className="mt-3 block">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/35">
                  Line spacing intensity ({spacingIntensity.toFixed(1)}x)
                </span>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={spacingIntensity}
                  onChange={(event) =>
                    setSpacingIntensity(Number(event.target.value) || 1)
                  }
                  className="mt-3 w-full accent-violet-300"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-xs font-black uppercase tracking-widest text-white/38">
                Draft confidence
              </p>
              <p className="mt-3 text-3xl font-black text-white">{preview.confidence}%</p>
              <p className="mt-1 text-sm font-bold text-violet-200">
                {preview.confidenceLabel}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-white/50">
                <div>
                  <dt className="font-bold uppercase tracking-widest text-white/30">
                    Intro est.
                  </dt>
                  <dd className="mt-1 text-sm text-white/70">
                    {preview.introEstimateSeconds}s
                  </dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-widest text-white/30">
                    Outro est.
                  </dt>
                  <dd className="mt-1 text-sm text-white/70">
                    {preview.outroEstimateSeconds}s padding
                  </dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-widest text-white/30">
                    Lines
                  </dt>
                  <dd className="mt-1 text-sm text-white/70">{preview.lineCount}</dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-widest text-white/30">
                    Gaps
                  </dt>
                  <dd className="mt-1 text-sm text-white/70">
                    {preview.instrumentalGapCount}
                  </dd>
                </div>
              </dl>
              {preview.warning ? (
                <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                  {preview.warning}
                </p>
              ) : null}
            </div>
          </aside>

          <div className="flex min-h-0 flex-col gap-4">
            <label className="block min-h-0 flex-1">
              <span className="text-xs font-black uppercase tracking-widest text-white/38">
                Original plain lyrics
              </span>
              <pre className="mt-2 max-h-48 overflow-auto rounded-2xl border border-white/10 bg-black/35 p-4 text-xs leading-6 text-white/60">
                {preview.plainLyrics || "No plain lyrics"}
              </pre>
            </label>

            <label className="block min-h-0 flex-1">
              <span className="text-xs font-black uppercase tracking-widest text-white/38">
                Generated LRC preview
              </span>
              <pre className="mt-2 max-h-64 overflow-auto rounded-2xl border border-violet-300/20 bg-violet-500/5 p-4 text-xs leading-6 text-violet-50">
                {preview.generatedLrc || "Generate timestamps to preview LRC."}
              </pre>
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 px-6 py-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-black text-white/75"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(preview.generatedLrc)}
            className="rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-45"
          >
            Confirm synced draft
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}
