"use client";

import { useRouter } from "next/navigation";

import AdminShell from "@/components/AdminShell";
import BulkUploadPanel from "@/components/BulkUploadPanel";

export default function AdminUploadPage() {
  const router = useRouter();

  return (
    <AdminShell
      title="Upload Studio"
      description="Upload audio, artwork, lyrics, and synced LRC files into a protected music operations workflow."
      actions={
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => router.push("/admin/releases")}
            className="rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black text-black shadow-[0_18px_45px_rgba(250,204,21,0.14)] transition hover:-translate-y-0.5"
          >
            View Releases
          </button>
          <button
            onClick={() => router.push("/admin/uploaders")}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white/75 transition hover:border-white/25"
          >
            Uploaders
          </button>
        </div>
      }
    >
      <div className="min-w-0 rounded-[2.2rem] border border-white/10 bg-[#101017]/75 p-2 shadow-2xl">
        <BulkUploadPanel />
      </div>
    </AdminShell>
  );
}
