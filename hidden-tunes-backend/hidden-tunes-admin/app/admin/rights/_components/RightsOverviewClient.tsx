"use client";

import { useEffect, useState } from "react";

import { getActiveUploaderSession } from "@/lib/auth";
import { PROPOSED_COHORTS } from "@/lib/rights/cohorts";

type Overview = {
  counts?: Record<string, number>;
  gates?: { enforcementEnabled: boolean; bulkExecutionEnabled: boolean };
  proposedCohorts?: typeof PROPOSED_COHORTS;
  error?: string;
};

export default function RightsOverviewClient() {
  const [overview, setOverview] = useState<Overview>({ proposedCohorts: PROPOSED_COHORTS });
  useEffect(() => {
    const controller = new AbortController();
    void getActiveUploaderSession().then(async ({ session }) => {
      if (!session || controller.signal.aborted) return;
      const response = await fetch("/api/admin/rights/overview", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: controller.signal,
      });
      const body = await response.json() as Overview;
      if (!controller.signal.aborted) setOverview(body);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setOverview({ error: error instanceof Error ? error.message : String(error), proposedCohorts: PROPOSED_COHORTS });
    });
    return () => controller.abort();
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 p-5">
        <h2 className="text-lg font-black text-emerald-100">Safety gates</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Gate label="Production enforcement" enabled={overview.gates?.enforcementEnabled ?? false} />
          <Gate label="Bulk execution" enabled={overview.gates?.bulkExecutionEnabled ?? false} />
        </div>
        <p className="mt-3 text-sm text-emerald-50/70">Both gates default OFF. Dry runs write preview metadata only.</p>
      </section>

      {overview.error ? <p className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm text-amber-100">{overview.error}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Object.entries(overview.counts ?? { total: 0, green: 0, amber: 0, red: 0, unknown: 0 }).map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs font-black uppercase tracking-widest text-white/40">{label}</p>
            <p className="mt-2 text-3xl font-black">{value.toLocaleString()}</p>
          </article>
        ))}
      </section>

      <section>
        <h2 className="text-xl font-black">Proposed cohorts — nothing applied</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {(overview.proposedCohorts ?? PROPOSED_COHORTS).map((cohort) => (
            <article key={cohort.key} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-black">{cohort.label}</h3>
                <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-black">{cohort.expectedCount.toLocaleString()}</span>
              </div>
              <p className="mt-3 text-sm text-yellow-100">Proposed: {cohort.proposal}</p>
              <p className="mt-2 text-sm text-white/55">{cohort.warning}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Gate({ label, enabled }: { label: string; enabled: boolean }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-sm text-white/60">{label}</p><p className={`mt-1 text-xl font-black ${enabled ? "text-red-200" : "text-emerald-200"}`}>{enabled ? "ON" : "OFF"}</p></div>;
}

