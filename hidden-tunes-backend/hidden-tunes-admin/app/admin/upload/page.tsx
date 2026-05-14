"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import BulkUploadPanel from "../../../components/BulkUploadPanel";

import {
  getUploaderProfile,
  supabase,
} from "@/lib/auth";

export default function AdminUploadPage() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);

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
      <main className="flex min-h-screen items-center justify-center bg-[#050508] text-white">
        <div className="rounded-3xl border border-white/10 bg-[#101017] px-8 py-6 text-sm text-white/60">
          Verifying admin access...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050508]">
      <div className="flex items-center justify-end px-6 pt-6">
        <button
          onClick={handleLogout}
          className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
        >
          Logout
        </button>
      </div>

      <BulkUploadPanel />
    </main>
  );
}