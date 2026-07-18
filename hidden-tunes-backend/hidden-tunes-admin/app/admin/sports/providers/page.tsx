"use client";

import Link from "next/link";
import { useMemo } from "react";

import AdminShell from "@/components/AdminShell";
import { listSportsProviders } from "@/lib/sports/providers";
import {
  OLYMPICS_PROVIDER_SLUG,
  OLYMPICS_YOUTUBE_CHANNEL_ID,
} from "@/lib/sports/providers/olympics/types";

export default function SportsProvidersAdminPage() {
  const providers = useMemo(() => listSportsProviders(), []);
  const olympics = providers.find((p) => p.config.slug === OLYMPICS_PROVIDER_SLUG);

  return (
    <AdminShell
      eyebrow="Sports"
      title="Providers"
      description="Phase 2A pilot provider controls. Defaults remain disabled."
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-50">
          Enabling playback requires explicit confirmation and local feature flags.
          Credentials are never shown here. See{" "}
          <code>docs/sports/providers/olympics-audit.md</code>.
        </div>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-lg font-medium text-white">Olympics pilot</h2>
          <dl className="mt-3 grid gap-2 text-sm text-white/75 sm:grid-cols-2">
            <div>
              <dt className="text-white/45">Slug</dt>
              <dd>
                <code>{OLYMPICS_PROVIDER_SLUG}</code>
              </dd>
            </div>
            <div>
              <dt className="text-white/45">Classification</dt>
              <dd>OFFICIAL_EMBED_ALLOWED</dd>
            </div>
            <div>
              <dt className="text-white/45">YouTube channel</dt>
              <dd>
                <code>{OLYMPICS_YOUTUBE_CHANNEL_ID}</code>
              </dd>
            </div>
            <div>
              <dt className="text-white/45">Kill switch (code default)</dt>
              <dd>{String(olympics?.config.killSwitch ?? true)}</dd>
            </div>
            <div>
              <dt className="text-white/45">Enabled (code default)</dt>
              <dd>{String(olympics?.config.enabled ?? false)}</dd>
            </div>
            <div>
              <dt className="text-white/45">Public ingestion default</dt>
              <dd>false</dd>
            </div>
            <div>
              <dt className="text-white/45">Playback enabled default</dt>
              <dd>false</dd>
            </div>
            <div>
              <dt className="text-white/45">Territory mode</dt>
              <dd>PROVIDER_RUNTIME_CHECK</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-white/60">
            Import (dry-run default):{" "}
            <code>
              npm run sports:import-provider -- --provider=olympics --limit=20
            </code>
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-white">All adapters</h2>
          <ul className="space-y-1 text-sm text-white/70">
            {providers.map((p) => (
              <li key={p.config.slug}>
                <code>{p.config.slug}</code> — {p.config.name} — enabled=
                {String(p.config.enabled)} killSwitch={String(p.config.killSwitch)}
              </li>
            ))}
          </ul>
        </section>

        <Link
          href="/admin/sports"
          className="inline-block text-sm text-sky-300 hover:text-sky-200"
        >
          ← Sports Dashboard
        </Link>
      </div>
    </AdminShell>
  );
}
