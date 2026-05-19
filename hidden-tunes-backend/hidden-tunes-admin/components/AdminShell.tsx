"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  getActiveUploaderSession,
  supabase,
  type UploaderProfile,
} from "@/lib/auth";
import {
  canManageUploaderOwnership,
  canManageUploaders,
} from "@/lib/adminPermissions";

type AdminShellProps = {
  children: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

const NAV_ITEMS = [
  {
    href: "/admin/upload",
    label: "Upload",
    description: "Bulk upload studio",
    roles: "all",
  },
  {
    href: "/admin/releases",
    label: "Releases",
    description: "Release operations",
    roles: "all",
  },
  {
    href: "/admin/submissions",
    label: "Submissions",
    description: "Artist review queue",
    roles: "ownership",
  },
  {
    href: "/admin/uploads/legacy",
    label: "Legacy Uploads",
    description: "Ownership backfill",
    roles: "ownership",
  },
  {
    href: "/admin/uploaders",
    label: "Uploaders",
    description: "Owner permissions",
    roles: "owner",
  },
] as const;

export default function AdminShell({
  children,
  eyebrow = "Hidden Tunes Admin",
  title,
  description,
  actions,
}: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<UploaderProfile | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      const { profile: activeProfile } = await getActiveUploaderSession();

      if (!activeProfile) {
        router.replace("/admin/login");
        return;
      }

      setProfile(activeProfile);
      setIsChecking(false);
    }

    loadProfile();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/admin/login");
  }

  if (isChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050508] px-4 text-white">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-8 py-6 text-sm font-bold text-white/55 shadow-2xl">
          Opening secure admin dashboard...
        </div>
      </main>
    );
  }

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.roles === "all") return true;
    if (item.roles === "owner") return canManageUploaders(profile?.role);
    return canManageUploaderOwnership(profile?.role);
  });

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050508] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.14),transparent_30%),radial-gradient(circle_at_90%_0%,rgba(168,85,247,0.1),transparent_24%),linear-gradient(180deg,#050508,#08080d_52%,#030305)]" />

      <div className="relative mx-auto flex w-full max-w-[1500px] min-w-0 flex-col gap-4 px-3 py-3 sm:px-5 sm:py-4 lg:grid lg:grid-cols-[minmax(230px,290px)_minmax(0,1fr)] lg:gap-6 lg:px-8 lg:py-6">
        <aside className="min-w-0 rounded-[2rem] border border-white/10 bg-white/[0.045] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.36)] backdrop-blur-xl lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:block">
            <button
              onClick={() => router.push("/admin/releases")}
              className="min-w-0 text-left"
            >
              <p className="text-xs font-black uppercase tracking-[0.32em] text-yellow-300">
                Hidden Tunes
              </p>
              <h2 className="mt-1 break-words text-2xl font-black tracking-[-0.05em]">
                Operations
              </h2>
            </button>

            <div className="w-fit rounded-full border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-yellow-100 lg:mt-5">
              {profile?.role || "uploader"}
            </div>
          </div>

          <nav className="mt-5 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {visibleNavItems.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/admin/upload" && pathname.startsWith(item.href));

              return (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  className={`min-w-0 rounded-2xl border px-4 py-3 text-left transition ${
                    active
                      ? "border-yellow-300/30 bg-yellow-300/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                      : "border-white/10 bg-white/[0.035] text-white/62 hover:border-white/20 hover:text-white"
                  }`}
                >
                  <span className="block break-words text-sm font-black">{item.label}</span>
                  <span className="mt-1 block break-words text-xs leading-5 text-white/38">
                    {item.description}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="mt-5 min-w-0 rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-xs font-black uppercase tracking-widest text-white/35">
              Signed in
            </p>
            <p className="mt-2 break-all text-sm font-bold text-white/72">
              {profile?.email || "Admin user"}
            </p>
            <button
              onClick={handleLogout}
              className="mt-4 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-white/72 transition hover:border-red-300/30 hover:text-red-100"
            >
              Logout
            </button>
          </div>
        </aside>

        <section className="min-w-0 max-w-full overflow-x-hidden">
          <header className="mb-5 rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:p-6">
            <div className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.32em] text-yellow-300">
                  {eyebrow}
                </p>
                <h1 className="mt-3 break-words text-4xl font-black tracking-[-0.055em] sm:text-6xl">
                  {title}
                </h1>
                {description ? (
                  <p className="mt-3 max-w-3xl break-words text-sm leading-6 text-white/55 sm:text-base">
                    {description}
                  </p>
                ) : null}
              </div>

              {actions ? (
                <div className="min-w-0 shrink-0 [&>*]:flex-wrap">{actions}</div>
              ) : null}
            </div>
          </header>

          {children}
        </section>
      </div>
    </main>
  );
}
