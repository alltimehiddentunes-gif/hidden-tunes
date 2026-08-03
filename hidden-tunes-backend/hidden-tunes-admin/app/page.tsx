"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/auth";

function hasRecoveryMarker() {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash || "";
  const search = window.location.search || "";
  return /(?:^|[&#?])type=recovery(?:&|$)/i.test(`${hash}${search}`);
}

/**
 * Site URL fallback landing.
 *
 * Supabase currently rewrites unlisted redirectTo values to the Auth Site URL
 * (https://admin.hiddentunes.com). Recovery links therefore land here with
 * type=recovery tokens in the URL. A server-side redirect to /admin/upload
 * would skip the reset-password UI, so this client page routes recovery
 * sessions correctly without treating normal sessions as password resets.
 */
export default function HomePage() {
  const router = useRouter();
  const [message, setMessage] = useState("Opening Hidden Tunes Admin...");

  useEffect(() => {
    let mounted = true;

    function goToReset() {
      if (!mounted) return;
      setMessage("Secure recovery session found. Opening reset password...");
      router.replace("/admin/reset-password");
    }

    function goToAdmin() {
      if (!mounted) return;
      router.replace("/admin/upload");
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || hasRecoveryMarker()) {
        goToReset();
      }
    });

    const timer = window.setTimeout(() => {
      if (hasRecoveryMarker()) {
        goToReset();
        return;
      }
      goToAdmin();
    }, 350);

    return () => {
      mounted = false;
      window.clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050508] px-4 text-white">
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-8 py-6 text-sm font-bold text-white/60 shadow-2xl">
        {message}
      </div>
    </main>
  );
}
