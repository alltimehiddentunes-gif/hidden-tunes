"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import BulkUploadPanel from "../../../components/BulkUploadPanel";

import {
  getUploaderProfile,
  supabase,
} from "@/lib/auth";

import {
  canManageUploaders,
} from "@/lib/adminPermissions";

export default function AdminUploadPage() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);

  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    async function validateSession() {
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

      setUserRole(profile.role || null);

      setIsLoading(false);
    }

    validateSession();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/admin/login");
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center text-white">
        Loading admin dashboard...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold">
              Hidden Tunes Admin
            </h1>

            <p className="text-sm text-white/60">
              Secure upload dashboard
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
              Role: {userRole}
            </div>

            {canManageUploaders(userRole) && (
              <button
                className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-2 text-sm font-medium text-yellow-300 transition hover:bg-yellow-500/20"
              >
                Manage Uploaders
              </button>
            )}

            <button
              onClick={handleLogout}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium transition hover:bg-white/10"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <BulkUploadPanel />
      </div>
    </main>
  );
}