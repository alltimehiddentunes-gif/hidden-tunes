"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import AdminShell from "@/components/AdminShell";
import { canManageUploaderOwnership } from "@/lib/adminPermissions";
import { getActiveUploaderSession, supabase } from "@/lib/auth";
import { formatRightsValue } from "@/lib/rightsReview";

type LegacyRelease = {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  trackCount: number;
  primaryGenre: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  reviewStatus: string | null;
  licenseDeclaration: string | null;
  currentOwner: string;
  nullOwnedTrackCount: number;
};

type UploaderOption = {
  id: string;
  email: string | null;
  role: string | null;
  status: string | null;
};

type LegacyUploadsResponse = {
  success: boolean;
  releases?: LegacyRelease[];
  uploaders?: UploaderOption[];
  error?: string;
};

type AssignResponse = {
  success: boolean;
  message?: string;
  updatedAlbumCount?: number;
  updatedSongCount?: number;
  error?: string;
};

type PendingAssignment = {
  releaseIds: string[];
  uploaderId: string;
  uploaderEmail: string;
};

function formatDate(value: string | null) {
  if (!value) return "Unknown date";

  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Unknown date";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(time));
}

function badgeClass(value: string | null) {
  const normalized = String(value || "").toLowerCase();

  if (normalized === "approved" || normalized === "published") {
    return "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";
  }
  if (normalized.includes("flagged") || normalized === "rejected") {
    return "border-red-300/20 bg-red-500/10 text-red-100";
  }
  if (normalized === "pending_review" || normalized === "draft") {
    return "border-yellow-300/25 bg-yellow-300/10 text-yellow-100";
  }
  return "border-white/10 bg-white/[0.05] text-white/58";
}

export default function LegacyUploadsPage() {
  const router = useRouter();
  const [releases, setReleases] = useState<LegacyRelease[]>([]);
  const [uploaders, setUploaders] = useState<UploaderOption[]>([]);
  const [selectedReleaseIds, setSelectedReleaseIds] = useState<string[]>([]);
  const [rowUploaderSelections, setRowUploaderSelections] = useState<
    Record<string, string>
  >({});
  const [bulkUploaderId, setBulkUploaderId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAssigning, setIsAssigning] = useState(false);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingAssignment, setPendingAssignment] =
    useState<PendingAssignment | null>(null);

  const selectedUploader = useMemo(
    () => uploaders.find((uploader) => uploader.id === bulkUploaderId) || null,
    [bulkUploaderId, uploaders]
  );

  const summary = useMemo(
    () => ({
      releases: releases.length,
      tracks: releases.reduce(
        (total, release) => total + release.nullOwnedTrackCount,
        0
      ),
      selected: selectedReleaseIds.length,
    }),
    [releases, selectedReleaseIds]
  );

  async function getRequiredAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token;

    if (!accessToken) {
      throw new Error("Your admin session expired. Sign in again.");
    }

    return accessToken;
  }

  const loadLegacyUploads = useCallback(async () => {
    const { profile } = await getActiveUploaderSession();
    if (!profile) {
      router.replace("/admin/login");
      return;
    }

    if (!canManageUploaderOwnership(profile.role)) {
      router.replace("/admin/releases");
      return;
    }

    const accessToken = await getRequiredAccessToken();

    const response = await fetch("/api/admin/uploads/legacy", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = (await response.json().catch(() => null)) as
      | LegacyUploadsResponse
      | null;

    if (!response.ok || !data?.success) {
      throw new Error(data?.error || "Could not load legacy uploads.");
    }

    setReleases(data.releases || []);
    setUploaders(data.uploaders || []);
    setSelectedReleaseIds((current) =>
      current.filter((releaseId) =>
        (data.releases || []).some((release) => release.id === releaseId)
      )
    );
  }, [router]);

  useEffect(() => {
    async function boot() {
      setIsLoading(true);
      setPageError("");

      try {
        await loadLegacyUploads();
      } catch (error: unknown) {
        setPageError(
          error instanceof Error
            ? error.message
            : "Legacy uploads could not load."
        );
      } finally {
        setIsLoading(false);
      }
    }

    boot();
  }, [loadLegacyUploads]);

  function toggleRelease(releaseId: string) {
    setSelectedReleaseIds((current) =>
      current.includes(releaseId)
        ? current.filter((id) => id !== releaseId)
        : [...current, releaseId]
    );
  }

  function toggleAll() {
    setSelectedReleaseIds((current) =>
      current.length === releases.length ? [] : releases.map((release) => release.id)
    );
  }

  function openSingleAssignment(release: LegacyRelease) {
    const uploaderId = rowUploaderSelections[release.id] || "";
    const uploader = uploaders.find((item) => item.id === uploaderId);

    if (!uploader) {
      setPageError("Select an uploader for this legacy release.");
      return;
    }

    setPendingAssignment({
      releaseIds: [release.id],
      uploaderId,
      uploaderEmail: uploader.email || "selected uploader",
    });
  }

  function openBulkAssignment() {
    if (selectedReleaseIds.length === 0) {
      setPageError("Select at least one legacy release.");
      return;
    }

    if (!selectedUploader) {
      setPageError("Select an uploader for the bulk assignment.");
      return;
    }

    setPendingAssignment({
      releaseIds: selectedReleaseIds,
      uploaderId: selectedUploader.id,
      uploaderEmail: selectedUploader.email || "selected uploader",
    });
  }

  async function confirmAssignment() {
    if (!pendingAssignment || isAssigning) return;

    setIsAssigning(true);
    setPageError("");
    setNotice("");

    try {
      const accessToken = await getRequiredAccessToken();

      const response = await fetch("/api/admin/uploads/legacy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          releaseIds: pendingAssignment.releaseIds,
          uploaderId: pendingAssignment.uploaderId,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | AssignResponse
        | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Ownership assignment failed.");
      }

      setNotice(
        data.message ||
          `Assigned ${pendingAssignment.releaseIds.length} legacy releases.`
      );
      setPendingAssignment(null);
      setSelectedReleaseIds([]);
      setBulkUploaderId("");
      setRowUploaderSelections({});
      await loadLegacyUploads();
    } catch (error: unknown) {
      setPageError(
        error instanceof Error ? error.message : "Ownership assignment failed."
      );
    } finally {
      setIsAssigning(false);
    }
  }

  return (
    <AdminShell
      eyebrow="Ownership Backfill"
      title="Legacy Uploads"
      description="Assign old releases with no uploader owner. Updates only rows where uploaded_by_user_id is still empty."
      actions={
        <button
          onClick={() => router.push("/admin/releases")}
          className="rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black text-black transition hover:-translate-y-0.5"
        >
          All Releases
        </button>
      }
    >
      <section className="mb-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Legacy Releases" value={String(summary.releases)} />
        <Metric label="Unowned Tracks" value={String(summary.tracks)} />
        <Metric label="Selected" value={String(summary.selected)} />
      </section>

      <section className="mb-4 min-w-0 rounded-[1.7rem] border border-white/10 bg-[#101017]/92 p-4 shadow-2xl">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-yellow-300">
              Bulk assignment
            </p>
            <p className="mt-2 break-words text-sm text-white/48">
              Select multiple legacy releases, choose one uploader, then confirm.
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:w-full sm:flex-row sm:flex-wrap lg:w-auto lg:max-w-[520px]">
            <select
              value={bulkUploaderId}
              onChange={(event) => setBulkUploaderId(event.target.value)}
              className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm outline-none transition focus:border-yellow-300"
            >
              <option value="">Select uploader</option>
              {uploaders.map((uploader) => (
                <option key={uploader.id} value={uploader.id}>
                  {uploader.email || uploader.id} ({uploader.role || "role unknown"})
                </option>
              ))}
            </select>
            <button
              onClick={openBulkAssignment}
              disabled={selectedReleaseIds.length === 0 || !bulkUploaderId}
              className="min-w-0 whitespace-normal rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black leading-5 text-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Assign selected
            </button>
          </div>
        </div>
      </section>

      {pageError ? (
        <Notice tone="error" message={pageError} />
      ) : notice ? (
        <Notice tone="success" message={notice} />
      ) : null}

      {isLoading ? (
        <section className="rounded-[1.7rem] border border-white/10 bg-[#101017]/92 p-5 text-sm font-bold text-white/50">
          Loading legacy uploads...
        </section>
      ) : releases.length === 0 ? (
        <section className="rounded-[2rem] border border-white/10 bg-[#101017]/92 p-8 text-center">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
            No legacy uploads
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">
            Every loaded release has ownership.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-white/50">
            Future uploads are assigned automatically by the upload metadata API.
          </p>
        </section>
      ) : (
        <section className="min-w-0 max-w-full rounded-[1.7rem] border border-white/10 bg-[#101017]/92 shadow-2xl">
          <div className="hidden grid-cols-[48px_minmax(0,1.4fr)_minmax(80px,0.5fr)_minmax(100px,0.7fr)_minmax(110px,0.8fr)_minmax(110px,0.8fr)_minmax(110px,0.8fr)_minmax(220px,260px)] gap-3 border-b border-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/35 2xl:grid">
            <button onClick={toggleAll} className="text-left text-white/45">
              All
            </button>
            <span>Release</span>
            <span>Tracks</span>
            <span>Genre</span>
            <span>Review</span>
            <span>License</span>
            <span>Date</span>
            <span>Assign</span>
          </div>
          <div className="divide-y divide-white/8">
            {releases.map((release) => (
              <article
                key={release.id}
                className="grid min-w-0 max-w-full gap-3 px-4 py-4 transition hover:bg-white/[0.035] md:grid-cols-[32px_minmax(0,1fr)] 2xl:grid-cols-[48px_minmax(0,1.4fr)_minmax(80px,0.5fr)_minmax(100px,0.7fr)_minmax(110px,0.8fr)_minmax(110px,0.8fr)_minmax(110px,0.8fr)_minmax(220px,260px)] 2xl:items-center"
              >
                <input
                  type="checkbox"
                  checked={selectedReleaseIds.includes(release.id)}
                  onChange={() => toggleRelease(release.id)}
                  className="h-4 w-4 accent-yellow-300"
                />
                <ReleaseIdentity release={release} />
                <div className="md:col-start-2 2xl:col-start-auto">
                  <InfoCell label="Tracks" value={String(release.trackCount)} />
                </div>
                <div className="md:col-start-2 2xl:col-start-auto">
                  <InfoCell label="Genre" value={release.primaryGenre || "Unknown"} />
                </div>
                <StatusBadge
                  label="Review"
                  value={release.reviewStatus}
                  fallback="Not reviewed"
                />
                <StatusBadge
                  label="License"
                  value={release.licenseDeclaration}
                  fallback="Unknown"
                />
                <div className="md:col-start-2 2xl:col-start-auto">
                  <InfoCell label="Date" value={formatDate(release.updatedAt || release.createdAt)} />
                </div>
                <div className="grid min-w-0 max-w-full gap-2 sm:grid-cols-[minmax(0,1fr)_auto] md:col-start-2 2xl:col-start-auto">
                  <select
                    value={rowUploaderSelections[release.id] || ""}
                    onChange={(event) =>
                      setRowUploaderSelections((current) => ({
                        ...current,
                        [release.id]: event.target.value,
                      }))
                    }
                    className="min-w-0 rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-xs outline-none transition focus:border-yellow-300"
                  >
                    <option value="">Select uploader</option>
                    {uploaders.map((uploader) => (
                      <option key={uploader.id} value={uploader.id}>
                        {uploader.email || uploader.id}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => openSingleAssignment(release)}
                    className="min-w-0 whitespace-normal rounded-2xl border border-yellow-300/25 bg-yellow-300/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-yellow-100"
                  >
                    Assign
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {pendingAssignment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/78 px-4 backdrop-blur-xl">
          <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-[#101017] p-6 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-yellow-300">
              Confirm ownership assignment
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">
              Assign legacy uploads?
            </h2>
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-white/62">
              You are assigning{" "}
              <span className="font-black text-white">
                {pendingAssignment.releaseIds.length}
              </span>{" "}
              legacy releases to{" "}
              <span className="font-black text-white">
                <span className="break-all">{pendingAssignment.uploaderEmail}</span>
              </span>
              . This will only update rows with no owner.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={confirmAssignment}
                disabled={isAssigning}
                className="flex-1 rounded-2xl bg-yellow-300 px-5 py-4 text-sm font-black text-black disabled:opacity-50"
              >
                {isAssigning ? "Assigning..." : "Confirm Assignment"}
              </button>
              <button
                onClick={() => setPendingAssignment(null)}
                disabled={isAssigning}
                className="rounded-2xl border border-white/10 px-5 py-4 text-sm font-black text-white/75 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

function ReleaseIdentity({ release }: { release: LegacyRelease }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className="h-14 w-14 shrink-0 rounded-2xl border border-white/10 bg-[#14141c] bg-cover bg-center"
        style={{
          backgroundImage: release.artworkUrl
            ? `url("${release.artworkUrl}")`
            : "linear-gradient(135deg,rgba(250,204,21,0.22),rgba(168,85,247,0.1),rgba(255,255,255,0.04))",
        }}
      />
      <div className="min-w-0">
        <h2 className="break-words text-base font-black tracking-[-0.02em]">
          {release.title}
        </h2>
        <p className="break-words text-sm font-bold text-white/50">
          {release.artist}
        </p>
        <p className="mt-1 break-words text-xs font-bold text-white/35">
          Current owner: {release.currentOwner}
        </p>
      </div>
    </div>
  );
}

function StatusBadge({
  label,
  value,
  fallback,
}: {
  label: string;
  value: string | null | undefined;
  fallback: string;
}) {
  return (
    <div className="min-w-0 md:col-start-2 2xl:col-start-auto">
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-white/30 2xl:hidden">
        {label}
      </p>
      <span
        className={`inline-flex max-w-full rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.13em] ${badgeClass(
          value || null
        )}`}
      >
        <span className="break-words">{formatRightsValue(value, fallback)}</span>
      </span>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-white/30 2xl:hidden">
        {label}
      </p>
      <p className="break-words text-sm font-bold text-white/66">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.055] p-4">
      <p className="break-words text-3xl font-black tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-widest text-white/38">
        {label}
      </p>
    </div>
  );
}

function Notice({ tone, message }: { tone: "success" | "error"; message: string }) {
  return (
    <section
      className={`mb-4 break-words rounded-[1.7rem] border p-4 text-sm ${
        tone === "success"
          ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
          : "border-red-400/20 bg-red-500/10 text-red-100"
      }`}
    >
      {message}
    </section>
  );
}
