import type { HealthSignal, ReleaseHealthCheck, ReleaseHealthSummary } from "@/lib/releaseHealth";

export type { ReleaseHealthSummary, ReleaseHealthCheck, HealthSignal };

function signalTone(status: HealthSignal) {
  if (status === "present") {
    return "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";
  }
  if (status === "partial") {
    return "border-yellow-300/25 bg-yellow-300/10 text-yellow-100";
  }
  if (status === "optional") {
    return "border-white/10 bg-white/[0.045] text-white/45";
  }
  return "border-red-300/20 bg-red-500/10 text-red-100";
}

function signalLabel(status: HealthSignal) {
  if (status === "present") return "Present";
  if (status === "partial") return "Partial";
  if (status === "optional") return "Optional";
  return "Missing";
}

export function ReleaseHealthCompact({ health }: { health: ReleaseHealthSummary }) {
  const attention = health.checks.filter(
    (check) => check.status === "missing" || check.status === "partial"
  );

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${signalTone(
            health.score >= 100 ? "present" : health.score >= 70 ? "partial" : "missing"
          )}`}
        >
          {health.score}% / {health.readinessLabel}
        </span>
        {attention.slice(0, 3).map((check) => (
          <span
            key={check.id}
            className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${signalTone(
              check.status
            )}`}
            title={check.detail}
          >
            {check.label}
          </span>
        ))}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-emerald-300"
          style={{ width: `${Math.max(0, Math.min(100, health.score))}%` }}
        />
      </div>
    </div>
  );
}

export function ReleaseHealthPanel({
  health,
  trackCount,
}: {
  health: ReleaseHealthSummary;
  trackCount: number;
}) {
  return (
    <div className="min-w-0 rounded-[2.1rem] border border-white/10 bg-[#101017]/92 p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
            Release Health
          </p>
          <p className="mt-2 text-sm text-white/45">
            Display-only readiness — uploads and review flow are unchanged.
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-white">{health.score}%</p>
          <p className="text-xs font-bold text-white/45">{health.readinessLabel}</p>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-emerald-300"
          style={{ width: `${Math.max(0, Math.min(100, health.score))}%` }}
        />
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {health.checks.map((check) => (
          <HealthCheckRow key={check.id} check={check} />
        ))}
      </div>

      <p className="mt-5 text-xs font-bold text-white/35">
        {trackCount} track{trackCount === 1 ? "" : "s"} evaluated for audio, artwork, lyrics,
        uploader, review, and metadata.
      </p>
    </div>
  );
}

function HealthCheckRow({ check }: { check: ReleaseHealthCheck }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-white/65">{check.label}</p>
        <p className="mt-0.5 break-words text-xs text-white/38">{check.detail}</p>
      </div>
      <span
        className={`shrink-0 rounded-full border px-3 py-1 text-xs font-black ${signalTone(
          check.status
        )}`}
      >
        {signalLabel(check.status)}
      </span>
    </div>
  );
}
