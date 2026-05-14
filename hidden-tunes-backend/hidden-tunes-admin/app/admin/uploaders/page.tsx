"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  mode?: string;
  uploader?: {
    userId: string;
    email: string;
    role: string;
  };
};

type UploaderStatus = "active" | "disabled";

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

export default function AdminUploadersPage() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [uploaders, setUploaders] = useState<UploaderProfile[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [newUploaderEmail, setNewUploaderEmail] = useState("");
  const [newUploaderRole, setNewUploaderRole] =
    useState<UploaderRole>("upload_manager");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [updatingUploaderId, setUpdatingUploaderId] = useState<string | null>(
    null
  );
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingDisableUploader, setPendingDisableUploader] =
    useState<UploaderProfile | null>(null);

  const cleanedEmail = useMemo(
    () => newUploaderEmail.trim().toLowerCase(),
    [newUploaderEmail]
  );

  const uploaderSummary = useMemo(
    () => ({
      total: uploaders.length,
      active: uploaders.filter((uploader) => uploader.status === "active")
        .length,
      disabled: uploaders.filter((uploader) => uploader.status === "disabled")
        .length,
      owners: uploaders.filter((uploader) => uploader.role === "owner")
        .length,
      uploadManagers: uploaders.filter(
        (uploader) => uploader.role === "upload_manager"
      ).length,
    }),
    [uploaders]
  );

  const isStatusUpdating = updatingUploaderId !== null;

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
    async function validateOwnerAccessAndLoadUploaders() {
      setErrorMessage(null);

      const { profile } = await getActiveUploaderSession();

      if (!profile) {
        router.replace("/admin/login");
        return;
      }

      if (!canManageUploaders(profile.role)) {
        router.replace("/admin/upload");
        return;
      }

      setUserRole(profile.role || null);
      await loadUploaders();
      setIsLoading(false);
    }

    validateOwnerAccessAndLoadUploaders();
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
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token;

      if (!accessToken) {
        setFormError("Missing authenticated uploader session.");
        return;
      }

      const response = await fetch("/api/admin/create-uploader", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: cleanedEmail,
          role: newUploaderRole,
        }),
      });

      const result = (await response.json()) as CreateUploaderApiResponse;

      if (!response.ok || !result.success) {
        setFormError(
          result.error || "Uploader could not be created. Please try again."
        );
        return;
      }

      setFormMessage(
        result.message ||
          `Uploader ${cleanedEmail} was created and marked active.`
      );
      setNewUploaderEmail("");
      await loadUploaders();
    } catch (error) {
      console.error("CREATE UPLOADER ERROR", error);
      setFormError(
        "Network error while creating uploader. Check your connection and try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdateUploaderStatus(
    uploader: UploaderProfile,
    status: UploaderStatus
  ) {
    if (updatingUploaderId) return false;

    setStatusError(null);
    setStatusMessage(null);
    setFormError(null);
    setFormMessage(null);

    if (uploader.role === "owner" && status === "disabled") {
      setStatusError("Owner accounts cannot be disabled.");
      return false;
    }

    setUpdatingUploaderId(uploader.id);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token;

      if (!accessToken) {
        setStatusError("Missing authenticated uploader session.");
        return false;
      }

      const response = await fetch("/api/admin/update-uploader-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          uploaderId: uploader.id,
          status,
        }),
      });

      const result = (await response.json()) as UpdateUploaderStatusApiResponse;

      if (!response.ok || !result.success) {
        setStatusError(
          result.error ||
            "Uploader status could not be updated. Refresh and try again."
        );
        return false;
      }

      const uploaderLabel = uploader.email || "Uploader";
      setStatusMessage(
        status === "disabled"
          ? `${uploaderLabel} is disabled and no longer has admin access.`
          : `${uploaderLabel} is active and can use allowed admin tools.`
      );
      await loadUploaders();
      return true;
    } catch (error) {
      console.error("UPDATE UPLOADER STATUS ERROR", error);
      setStatusError(
        "Network error while updating uploader status. Check your connection and try again."
      );
      return false;
    } finally {
      setUpdatingUploaderId(null);
    }
  }

  function handleRequestDisableUploader(uploader: UploaderProfile) {
    if (updatingUploaderId) return;

    setStatusError(null);
    setStatusMessage(null);

    if (uploader.role === "owner") {
      setStatusError("Owner accounts cannot be disabled.");
      return;
    }

    setPendingDisableUploader(uploader);
  }

  async function handleConfirmDisableUploader() {
    if (!pendingDisableUploader) return;

    const uploader = pendingDisableUploader;
    await handleUpdateUploaderStatus(uploader, "disabled");
    setPendingDisableUploader(null);
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center text-white">
        Checking owner permissions...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold">Manage Uploaders</h1>
            <p className="text-sm text-white/60">
              Owner-only team permission dashboard
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-300">
              Role: {userRole}
            </div>

            <button
              onClick={() => router.push("/admin/upload")}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium transition hover:bg-white/10"
            >
              Back to Uploads
            </button>
          </div>
        </div>
      </div>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[420px_1fr]">
        <div className="rounded-2xl border border-yellow-500/10 bg-white/[0.03] p-6">
          <h2 className="text-xl font-semibold">Create Uploader</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">
            Creates a Supabase auth user and inserts the matching uploader
            profile. Upload permissions are still not activated yet.
          </p>

          <form onSubmit={handleCreateUploader} className="mt-6 space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-white/70">
                Uploader Email
              </label>
              <input
                type="email"
                value={newUploaderEmail}
                disabled={isSubmitting}
                onChange={(event) => {
                  setNewUploaderEmail(event.target.value);
                  setFormError(null);
                  setFormMessage(null);
                }}
                placeholder="team@example.com"
                className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-yellow-500/40 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white/70">
                Role
              </label>
              <select
                value={newUploaderRole}
                disabled={isSubmitting}
                onChange={(event) => {
                  const value = event.target.value;
                  if (isAllowedUploaderRole(value)) setNewUploaderRole(value);
                  setFormError(null);
                  setFormMessage(null);
                }}
                className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-yellow-500/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="upload_manager">Upload Manager</option>
                <option value="owner">Owner</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-yellow-400 px-4 py-3 text-sm font-bold text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Creating Uploader..." : "Create Uploader"}
            </button>
          </form>

          {formError && (
            <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm leading-6 text-red-200">
              {formError}
            </div>
          )}

          {formMessage && (
            <div className="mt-5 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm leading-6 text-yellow-200">
              {formMessage}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Uploader Profiles</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
                Existing uploader profiles.
              </p>
            </div>

            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">
              Total: {uploaders.length}
            </div>
          </div>

          {errorMessage && (
            <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
              Failed to load uploader profiles: {errorMessage}
            </div>
          )}

          {statusError && (
            <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
              {statusError}
            </div>
          )}

          {statusMessage && (
            <div className="mt-6 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-200">
              {statusMessage}
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Total Uploaders", uploaderSummary.total],
              ["Active", uploaderSummary.active],
              ["Disabled", uploaderSummary.disabled],
              ["Owners", uploaderSummary.owners],
              ["Upload Managers", uploaderSummary.uploadManagers],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                  {label}
                </p>
                <p className="mt-3 text-3xl font-black text-white">{value}</p>
              </div>
            ))}
          </div>

          {!errorMessage && uploaders.length === 0 && (
            <div className="mt-6 rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-white/50">
              No uploader profiles found yet. Create the first uploader to
              begin managing team access.
            </div>
          )}

          {!errorMessage && uploaders.length > 0 && (
            <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-white/[0.04] text-white/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/10">
                  {uploaders.map((uploader) => {
                    const isUpdating = updatingUploaderId === uploader.id;
                    const canActivate =
                      uploader.role === "upload_manager" &&
                      uploader.status === "disabled";
                    const canDisable =
                      uploader.role === "upload_manager" &&
                      uploader.status === "active";

                    return (
                      <tr key={uploader.id} className="bg-black/20">
                        <td className="px-4 py-4 text-white/85">
                          {uploader.email || "No email"}
                        </td>
                        <td className="px-4 py-4">
                          <span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-3 py-1 text-xs text-yellow-300">
                            {uploader.role || "No role"}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                            {uploader.status || "No status"}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-white/50">
                          {uploader.created_at
                            ? new Date(
                                uploader.created_at
                              ).toLocaleDateString()
                            : "Unknown"}
                        </td>
                        <td className="px-4 py-4">
                          {uploader.role === "owner" ? (
                            <span className="text-xs text-white/40">
                              Protected
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={!canActivate || isStatusUpdating}
                                onClick={() =>
                                  handleUpdateUploaderStatus(
                                    uploader,
                                    "active"
                                  )
                                }
                                className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs font-semibold text-yellow-300 transition hover:bg-yellow-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {isUpdating && canActivate
                                  ? "Activating..."
                                  : "Activate"}
                              </button>

                              <button
                                type="button"
                                disabled={!canDisable || isStatusUpdating}
                                onClick={() =>
                                  handleRequestDisableUploader(uploader)
                                }
                                className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {isUpdating && canDisable
                                  ? "Disabling..."
                                  : "Disable"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {pendingDisableUploader && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-[#101017] p-6 shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-red-300">
              Disable uploader
            </p>

            <h2 className="mt-3 text-2xl font-bold text-white">
              Remove admin access?
            </h2>

            <p className="mt-3 text-sm leading-6 text-white/60">
              Disabling {pendingDisableUploader.email || "this uploader"} will
              immediately remove their Hidden Tunes admin access, block future
              dashboard use, and force their active sessions back to the login
              screen.
            </p>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isStatusUpdating}
                onClick={() => setPendingDisableUploader(null)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isStatusUpdating}
                onClick={handleConfirmDisableUploader}
                className="rounded-xl border border-red-500/20 bg-red-500/20 px-4 py-3 text-sm font-bold text-red-100 transition hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {updatingUploaderId === pendingDisableUploader.id
                  ? "Disabling..."
                  : "Disable Access"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
