"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getUploaderProfile, supabase } from "@/lib/auth";
import { canManageUploaders } from "@/lib/adminPermissions";

export default function AdminUploadersPage() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    async function validateOwnerAccess() {
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
      setIsLoading(false);
    }

    validateOwnerAccess();
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
          <h2 className="text-xl font-semibold">Uploader Management</h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
            This owner-only page is ready for future uploader controls. No team
            member records are being changed yet.
          </p>

          <div className="mt-6 rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-white/50">
            Next safe step will be reading uploader profiles from Supabase.
          </div>
        </div>
      </section>
    </main>
  );
}