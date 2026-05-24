import type { UploaderAnalyticsSummary } from "@/lib/uploaderAnalytics";
import { formatRightsValue } from "@/lib/rightsReview";

export function UploaderAnalyticsPanel({
  analytics,
  compact = false,
}: {
  analytics: UploaderAnalyticsSummary;
  compact?: boolean;
}) {
  const reviewEntries = Object.entries(analytics.reviewStatusCounts).sort(
    (a, b) => b[1] - a[1]
  );

  if (compact) {
    return (
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniMetric label="Releases" value={String(analytics.totalReleases)} />
        <MiniMetric label="Tracks" value={String(analytics.totalTracks)} />
        <MiniMetric label="Ready" value={String(analytics.fullyReadyReleases)} />
        <MiniMetric
          label="Plain lyrics"
          value={`${analytics.plainLyricsCompletionPercent}%`}
        />
      </div>
    );
  }

  return (
    <section className="mb-4 rounded-[1.7rem] border border-white/10 bg-[#101017]/92 p-5 shadow-2xl">
      <div className="flex flex-col gap-2 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
            Uploader Analytics
          </p>
          <p className="mt-2 text-sm text-white/45">
            Display-only readiness metrics — uploads and permissions are unchanged.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsMetric label="Total releases" value={analytics.totalReleases} />
        <AnalyticsMetric label="Total tracks" value={analytics.totalTracks} />
        <AnalyticsMetric
          label="Fully ready releases"
          value={analytics.fullyReadyReleases}
        />
        <AnalyticsMetric
          label="Releases missing artwork"
          value={analytics.releasesMissingArtwork}
        />
        <AnalyticsMetric
          label="Tracks missing audio"
          value={analytics.tracksMissingAudio}
        />
        <AnalyticsMetric
          label="Plain lyrics completion"
          value={`${analytics.plainLyricsCompletionPercent}%`}
          detail={`${analytics.plainLyricsReadyTracks}/${analytics.totalTracks} tracks`}
        />
        <AnalyticsMetric
          label="Synced lyrics completion"
          value={`${analytics.syncedLyricsCompletionPercent}%`}
          detail={`${analytics.syncedLyricsReadyTracks}/${analytics.totalTracks} tracks`}
        />
        <AnalyticsMetric
          label="Pending / review buckets"
          value={reviewEntries.length}
          detail={
            reviewEntries.length
              ? reviewEntries
                  .slice(0, 3)
                  .map(([status, count]) => `${formatRightsValue(status, status)}: ${count}`)
                  .join(" · ")
              : "No review statuses yet"
          }
        />
      </div>

      {reviewEntries.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {reviewEntries.map(([status, count]) => (
            <span
              key={status}
              className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-black text-white/70"
            >
              {formatRightsValue(status, status)}: {count}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function AnalyticsMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-2xl font-black tracking-[-0.04em] text-white">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-widest text-white/38">
        {label}
      </p>
      {detail ? (
        <p className="mt-2 break-words text-xs text-white/40">{detail}</p>
      ) : null}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
      <p className="text-sm font-black text-white">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">
        {label}
      </p>
    </div>
  );
}
