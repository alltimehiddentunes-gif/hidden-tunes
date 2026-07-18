import Link from "next/link";

import AdminShell from "@/components/AdminShell";
import { getSportsAdminDashboard } from "@/lib/sports/admin/dashboard";
import { SPORTS_FEATURE_FLAG_DEFAULTS } from "@/lib/sports/constants";
import { listSportsProviders } from "@/lib/sports/providers";
import { listSportsWorkerKeys } from "@/lib/sports/workers";

const SECTION_LINKS = [
  { href: "/admin/sports/channels", label: "Channels" },
  { href: "/admin/sports/events", label: "Events" },
  { href: "/admin/sports/competitions", label: "Competitions" },
  { href: "/admin/sports/teams", label: "Teams" },
  { href: "/admin/sports/athletes", label: "Athletes" },
  { href: "/admin/sports/providers", label: "Providers" },
  { href: "/admin/sports/rights", label: "Rights" },
  { href: "/admin/sports/territories", label: "Territories" },
  { href: "/admin/sports/verification", label: "Verification" },
  { href: "/admin/sports/health", label: "Health" },
  { href: "/admin/sports/quarantine", label: "Quarantine" },
  { href: "/admin/sports/imports", label: "Imports" },
  { href: "/admin/sports/workers", label: "Workers" },
  { href: "/admin/sports/playback-failures", label: "Playback Failures" },
  { href: "/admin/sports/reports", label: "Reports" },
  { href: "/admin/sports/settings", label: "Settings" },
] as const;

export default async function SportsAdminDashboardPage() {
  let stats = null as Awaited<ReturnType<typeof getSportsAdminDashboard>> | null;
  let error: string | null = null;
  try {
    stats = await getSportsAdminDashboard();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <AdminShell
      eyebrow="Sports"
      title="Sports Dashboard"
      description="Phase 1 foundation — rights-first, no mass import, no unauthorized streams."
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-50">
          Public Sports is <strong>disabled by default</strong>. Feature flags keep
          unfinished surfaces off. Emergency actions are audited and never expose
          secret playback URLs.
        </div>

        {error && (
          <p className="text-sm text-red-200">
            Dashboard stats unavailable (tables may not be migrated yet): {error}
          </p>
        )}

        {stats && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["Live events", stats.liveEvents],
                ["Starting soon", stats.startingSoon],
                ["Published channels", stats.publishedChannels],
                ["Verified streams", stats.verifiedStreams],
                ["Quarantined streams", stats.quarantinedStreams],
                ["Rights expiring (30d)", stats.rightsExpiring],
                ["Failures (24h)", stats.recentFailures],
                ["Pending rights review", stats.pendingRightsReview],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-white/10 bg-white/5 p-4"
              >
                <div className="text-xs uppercase tracking-wide text-white/45">
                  {label}
                </div>
                <div className="mt-1 text-2xl font-semibold text-white">
                  {value}
                </div>
              </div>
            ))}
          </div>
        )}

        <section>
          <h2 className="mb-2 text-lg font-medium text-white">Sections</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {SECTION_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 hover:bg-white/10"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-white">
            Feature flag defaults
          </h2>
          <ul className="space-y-1 text-sm text-white/70">
            {Object.entries(SPORTS_FEATURE_FLAG_DEFAULTS).map(([key, enabled]) => (
              <li key={key}>
                <code className="text-white/90">{key}</code>: {enabled ? "on" : "off"}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-white">
            Providers (placeholders)
          </h2>
          <ul className="space-y-1 text-sm text-white/70">
            {listSportsProviders().map((p) => (
              <li key={p.config.slug}>
                {p.config.name} — killSwitch={String(p.config.killSwitch)} enabled=
                {String(p.config.enabled)}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-white">Worker skeletons</h2>
          <ul className="space-y-1 text-sm text-white/70">
            {listSportsWorkerKeys().map((key) => (
              <li key={key}>
                <code>{key}</code>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AdminShell>
  );
}
