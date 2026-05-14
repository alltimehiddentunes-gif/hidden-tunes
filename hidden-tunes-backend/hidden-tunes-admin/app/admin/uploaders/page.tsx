"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getUploaderProfile, supabase } from "@/lib/auth";
import { canManageUploaders } from "@/lib/adminPermissions";

type UploaderProfile = {
  id: string;
  email: string | null;
  role: string | null;
  status: string | null;
  created_at: string | null;
};

export default function AdminUploadersPage() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [uploaders, setUploaders] = useState<UploaderProfile[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function validateOwnerAccessAndLoadUploaders() {
      setErrorMessage(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        router.replace("/admin/login");
        return;
      }

      const { profile } = await getUploaderProfile(session.user.id);

      if (!profile || profile.status !== "active") {
        await supabase.auth.signOut();
        router.replace("/admin/login");
        return;
      }

      if (!canManageUploaders(profile.role)) {
        router.replace("/admin/upload");
        return;
      }

      setUserRole(profile.role || null);

      const { data, error } = await supabase
        .from("uploader_profiles")
        .select("id, email, role, status, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMessage(error.message);
        setUploaders([]);
      } else {
        setUploaders((data || []) as UploaderProfile[]);
      }

      setIsLoading(false);
    }

    validateOwnerAccessAndLoadUploaders();
  }, [router]);

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

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Uploader Profiles</h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
                Read-only view of existing uploader profiles. No team member
                records are being changed yet.
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

          {!errorMessage && uploaders.length === 0 && (
            <div className="mt-6 rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-white/50">
              No uploader profiles found yet.
            </div>
          )}

          {!errorMessage && uploaders.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-white/[0.04] text-white/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/10">
                  {uploaders.map((uploader) => (
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
                          ? new Date(uploader.created_at).toLocaleDateString()
                          : "Unknown"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-white/50">
            Next safe step will be owner-only invite/create uploader controls.
          </div>
        </div>
      </section>
    </main>
  );
}