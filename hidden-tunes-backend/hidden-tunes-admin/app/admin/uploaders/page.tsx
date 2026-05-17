"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import AdminShell from "@/components/AdminShell";
import { getActiveUploaderSession, supabase } from "@/lib/auth";
import { canManageUploaders } from "@/lib/adminPermissions";

type UploaderRole = "upload_manager" | "owner";

type UploaderProfile = {
  id: string;
  email: string | null;
  role: string | null;
  status: string | null;
  created_at: string | null;
};

type CreateUploaderApiResponse = {
  success: boolean;
  error?: string;
  message?: string;
  uploader?: {
    userId: string;
    email: string;
    role: string;
  };
};

type UpdateUploaderStatusApiResponse = {
  success: boolean;
  error?: string;
  message?: string;
};

const ALLOWED_UPLOADER_ROLES: UploaderRole[] = ["upload_manager", "owner"];

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isAllowedUploaderRole(value: string): value is UploaderRole {
  return ALLOWED_UPLOADER_ROLES.includes(value as UploaderRole);
}

function formatDate(value: string | null) {
  if (!value) return "Recently added";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default function AdminUploadersPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [uploaders, setUploaders] = useState<UploaderProfile[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newUploaderEmail, setNewUploaderEmail] = useState("");
  const [newUploaderRole, setNewUploaderRole] =
    useState<UploaderRole>("upload_manager");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [updatingUploaderId, setUpdatingUploaderId] = useState<string | null>(
    null
  );
  const [pendingDisableUploader, setPendingDisableUploader] =
    useState<UploaderProfile | null>(null);

  const cleanedEmail = useMemo(
    () => newUploaderEmail.trim().toLowerCase(),
    [newUploaderEmail]
  );

  const summary = useMemo(
    () => ({
      total: uploaders.length,
      active: uploaders.filter((uploader) => uploader.status === "active")
        .length,
      disabled: uploaders.filter((uploader) => uploader.status === "disabled")
        .length,
      owners: uploaders.filter((uploader) => uploader.role === "owner").length,
    }),
    [uploaders]
  );

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token || "";
  }

  async function loadUploaders() {
    const { data, error } = await supabase
      .from("uploader_profiles")
      .select("id, email, role, status, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMessage(error.message);
      setUploaders([]);
      return;
    }

    setErrorMessage(null);
    setUploaders((data || []) as UploaderProfile[]);
  }

  useEffect(() => {
    async function validateOwnerAndLoad() {
      const { profile } = await getActiveUploaderSession();

      if (!profile) {
        router.replace("/admin/login");
        return;
      }

      if (!canManageUploaders(profile.role)) {
        router.replace("/admin/upload");
        return;
      }

      await loadUploaders();
      setIsLoading(false);
    }

    validateOwnerAndLoad();
  }, [router]);

  async function handleCreateUploader(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setFormError(null);
    setFormMessage(null);
    setStatusError(null);
    setStatusMessage(null);

    if (!cleanedEmail) {
      setFormError("Enter the uploader email.");
      return;
    }

    if (!isValidEmail(cleanedEmail)) {
      setFormError("Enter a valid uploader email address.");
      return;
    }

    if (!isAllowedUploaderRole(newUploaderRole)) {
      setFormError("Select a valid uploader role.");
      return;
    }

    setIsSubmitting(true);

    try {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        setFormError("Missing authenticated owner session.");
        return;
      }

      const response = await fetch("/api/admin/create-uploader", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: cleanedEmail,
          role: newUploaderRole,
        }),
      });
      const result = (await response.json()) as CreateUploaderApiResponse;

      if (!response.ok || !result.success) {
        setFormError(result.error || "Uploader could not be created.");
        return;
      }

      setFormMessage(
        result.message ||
          `Invite email sent to ${result.uploader?.email || cleanedEmail}.`
      );
      setNewUploaderEmail("");
      await loadUploaders();
    } catch {
      setFormError("Network error while creating uploader. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateUploaderStatus(
    uploader: UploaderProfile,
    status: "active" | "disabled"
  ) {
    if (updatingUploaderId) return;

    if (uploader.role === "owner" && status === "disabled") {
      setStatusError("Owner accounts cannot be disabled.");
      return;
    }

    setUpdatingUploaderId(uploader.id);
    setStatusError(null);
    setStatusMessage(null);
    setFormError(null);
    setFormMessage(null);

    try {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        setStatusError("Missing authenticated owner session.");
        return;
      }

      const response = await fetch("/api/admin/update-uploader-status", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uploaderId: uploader.id,
          status,
        }),
      });
      const result = (await response.json()) as UpdateUploaderStatusApiResponse;

      if (!response.ok || !result.success) {
        setStatusError(result.error || "Uploader status could not be updated.");
        return;
      }

      setStatusMessage(
        result.message ||
          `${uploader.email || "Uploader"} is now ${status}.`
      );
      await loadUploaders();
    } catch {
      setStatusError("Network error while updating uploader status.");
    } finally {
      setUpdatingUploaderId(null);
    }
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050508] px-4 text-white">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-8 py-6 text-sm font-bold text-white/55">
          Checking owner permissions...
        </div>
      </main>
    );
  }

  return (
    <AdminShell
      title="Uploaders"
      description="Invite upload managers, keep owner access protected, and disable uploader access without touching catalog data."
      actions={
        <button
          onClick={() => router.push("/admin/upload")}
          className="rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black text-black shadow-[0_18px_45px_rgba(250,204,21,0.14)] transition hover:-translate-y-0.5"
        >
          Open Upload Studio
        </button>
      }
    >
      <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <aside className="flex flex-col gap-5">
          <div className="rounded-[2.1rem] border border-white/10 bg-[#101017]/92 p-5 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
              Create Access
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">
              Invite uploader
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/55">
              Invitations use Supabase Auth and create the matching uploader
              profile for the selected role.
            </p>

            <form onSubmit={handleCreateUploader} className="mt-6 space-y-4">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-widest text-white/38">
                  Email
                </span>
                <input
                  value={newUploaderEmail}
                  onChange={(event) => setNewUploaderEmail(event.target.value)}
                  type="email"
                  placeholder="uploader@hiddentune.com"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm outline-none transition focus:border-yellow-300"
                />
              </label>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-widest text-white/38">
                  Role
                </span>
                <select
                  value={newUploaderRole}
                  onChange={(event) =>
                    setNewUploaderRole(event.target.value as UploaderRole)
                  }
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm outline-none transition focus:border-yellow-300"
                >
                  <option value="upload_manager">Upload Manager</option>
                  <option value="owner">Owner</option>
                </select>
              </label>

              {formError ? <Notice tone="error" message={formError} /> : null}
              {formMessage ? <Notice tone="success" message={formMessage} /> : null}

              <button
                disabled={isSubmitting}
                className="w-full rounded-2xl bg-yellow-300 px-5 py-4 text-sm font-black text-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Sending Invite..." : "Send Invite"}
              </button>
            </form>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Metric label="Total" value={String(summary.total)} />
            <Metric label="Active" value={String(summary.active)} />
            <Metric label="Disabled" value={String(summary.disabled)} />
            <Metric label="Owners" value={String(summary.owners)} />
          </div>
        </aside>

        <section className="rounded-[2.1rem] border border-white/10 bg-[#101017]/92 p-5 shadow-2xl">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
                Team Access
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">
                Active profiles
              </h2>
            </div>
            <p className="text-sm text-white/45">
              Owner accounts cannot be disabled from this screen.
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-3">
            {errorMessage ? <Notice tone="error" message={errorMessage} /> : null}
            {statusError ? <Notice tone="error" message={statusError} /> : null}
            {statusMessage ? <Notice tone="success" message={statusMessage} /> : null}

            {uploaders.map((uploader) => (
              <article
                key={uploader.id}
                className="rounded-[1.5rem] border border-white/10 bg-black/24 p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-lg font-black">{uploader.email}</p>
                    <p className="mt-1 text-sm text-white/45">
                      {uploader.role || "unknown"} / {formatDate(uploader.created_at)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-3 py-2 text-xs font-black uppercase tracking-widest ${
                        uploader.status === "active"
                          ? "bg-emerald-400/10 text-emerald-100"
                          : "bg-red-400/10 text-red-100"
                      }`}
                    >
                      {uploader.status || "unknown"}
                    </span>

                    {uploader.status !== "active" ? (
                      <button
                        disabled={updatingUploaderId === uploader.id}
                        onClick={() => updateUploaderStatus(uploader, "active")}
                        className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-emerald-100 disabled:opacity-40"
                      >
                        Activate
                      </button>
                    ) : (
                      <button
                        disabled={
                          uploader.role === "owner" ||
                          updatingUploaderId === uploader.id
                        }
                        onClick={() => setPendingDisableUploader(uploader)}
                        className="rounded-full border border-red-300/20 bg-red-400/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-red-100 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        Disable
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>

      {pendingDisableUploader ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/78 px-4 backdrop-blur-xl">
          <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#101017] p-6 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-red-200">
              Confirm Disable
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">
              Disable uploader access?
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/60">
              {pendingDisableUploader.email} will no longer be able to upload or
              manage admin tools.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => {
                  updateUploaderStatus(pendingDisableUploader, "disabled");
                  setPendingDisableUploader(null);
                }}
                className="flex-1 rounded-2xl bg-red-300 px-5 py-4 text-sm font-black text-black"
              >
                Disable Access
              </button>
              <button
                onClick={() => setPendingDisableUploader(null)}
                className="rounded-2xl border border-white/10 px-5 py-4 text-sm font-black text-white/75"
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
      <p className="text-3xl font-black tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-widest text-white/38">
        {label}
      </p>
    </div>
  );
}

function Notice({ tone, message }: { tone: "success" | "error"; message: string }) {
  return (
    <p
      className={`rounded-2xl border px-4 py-3 text-sm ${
        tone === "success"
          ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
          : "border-red-400/20 bg-red-500/10 text-red-100"
      }`}
    >
      {message}
    </p>
  );
}
