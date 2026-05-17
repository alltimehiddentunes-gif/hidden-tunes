"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import AdminShell from "@/components/AdminShell";
import { canManageUploaderOwnership } from "@/lib/adminPermissions";
import { getActiveUploaderSession } from "@/lib/auth";

type SubmissionStatus = {
  value: string;
  label: string;
  description: string;
  tone: string;
};

const SUBMISSION_STATUSES: SubmissionStatus[] = [
  {
    value: "draft",
    label: "Drafts",
    description: "Artists prepare title, credits, assets, and submission details.",
    tone: "border-white/10 bg-white/[0.055] text-white/64",
  },
  {
    value: "pending_review",
    label: "Pending Review",
    description: "Submitted items waiting for admin or owner review.",
    tone: "border-yellow-300/25 bg-yellow-300/10 text-yellow-100",
  },
  {
    value: "needs_changes",
    label: "Needs Changes",
    description: "Review feedback has been sent back before resubmission.",
    tone: "border-cyan-300/20 bg-cyan-400/10 text-cyan-100",
  },
  {
    value: "approved",
    label: "Approved",
    description: "Admin-approved submissions ready for a future publish workflow.",
    tone: "border-emerald-300/20 bg-emerald-400/10 text-emerald-100",
  },
  {
    value: "rejected",
    label: "Rejected",
    description: "Declined submissions remain separate from the live catalog.",
    tone: "border-red-300/20 bg-red-500/10 text-red-100",
  },
];

export default function AdminSubmissionsPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [pageError, setPageError] = useState("");

  const summary = useMemo(
    () => ({
      states: SUBMISSION_STATUSES.length,
      liveReads: 0,
      publishing: "Disabled",
    }),
    []
  );

  useEffect(() => {
    let ignore = false;

    async function checkAccess() {
      const { profile } = await getActiveUploaderSession();

      if (!profile) {
        router.replace("/admin/login");
        return;
      }

      if (!canManageUploaderOwnership(profile.role)) {
        if (!ignore) {
          setPageError("Only owners and admins can review artist submissions.");
        }
      }

      if (!ignore) setIsChecking(false);
    }

    checkAccess();

    return () => {
      ignore = true;
    };
  }, [router]);

  return (
    <AdminShell
      eyebrow="Artist Submissions"
      title="Review Queue"
      description="Foundation-only workspace for future artist submissions. Admin and owner accounts remain the final authority before anything can reach the live catalog."
      actions={
        <button
          onClick={() => router.push("/admin/releases")}
          className="rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black text-black transition hover:-translate-y-0.5"
        >
          Releases
        </button>
      }
    >
      {isChecking ? (
        <section className="rounded-[1.7rem] border border-white/10 bg-[#101017]/92 p-5 text-sm font-bold text-white/50">
          Checking submission review access...
        </section>
      ) : pageError ? (
        <section className="rounded-[1.7rem] border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-100">
          {pageError}
        </section>
      ) : (
        <>
          <section className="mb-4 grid gap-3 sm:grid-cols-3">
            <Metric label="Workflow States" value={String(summary.states)} />
            <Metric label="Live Reads" value={String(summary.liveReads)} />
            <Metric label="Publishing" value={summary.publishing} />
          </section>

          <section className="mb-4 rounded-[2rem] border border-white/10 bg-[#101017]/92 p-6 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
              Foundation Phase
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">
              Submissions stay separate from releases.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/52">
              The new `artist_submissions` table is designed to stage artist
              intent before review. This page does not upload audio, change R2
              assets, create albums, create songs, or publish anything directly.
            </p>
          </section>

          <section className="grid gap-3 xl:grid-cols-5">
            {SUBMISSION_STATUSES.map((status) => (
              <article
                key={status.value}
                className="rounded-[1.6rem] border border-white/10 bg-white/[0.045] p-4"
              >
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${status.tone}`}
                >
                  {status.value}
                </span>
                <h3 className="mt-4 text-xl font-black tracking-[-0.03em]">
                  {status.label}
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/48">
                  {status.description}
                </p>
              </article>
            ))}
          </section>

          <section className="mt-4 rounded-[1.7rem] border border-yellow-300/15 bg-yellow-300/[0.06] p-5">
            <p className="text-sm font-bold leading-6 text-yellow-50/78">
              Next safe step after applying SQL: add a read-only API that lists
              `artist_submissions` for owner/admin review. Publishing into
              `albums` or `songs` should remain a later, explicit workflow.
            </p>
          </section>
        </>
      )}
    </AdminShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-4">
      <p className="text-3xl font-black tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-widest text-white/38">
        {label}
      </p>
    </div>
  );
}
