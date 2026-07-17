"use client";

import Link from "next/link";

import AdminShell from "@/components/AdminShell";

export default function SportsAdminSectionPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <AdminShell eyebrow="Sports" title={title} description={description}>
      <div className="space-y-4">
        <p className="text-sm text-white/70">
          Phase 1 foundation page. Operational tooling will expand after the
          first official provider audit. Secret playback URLs are never shown
          here.
        </p>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
          Emergency controls (audited): disable stream/provider/competition/country,
          force external-only, unpublish, quarantine, revoke rights, restore after
          review.
        </div>
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
