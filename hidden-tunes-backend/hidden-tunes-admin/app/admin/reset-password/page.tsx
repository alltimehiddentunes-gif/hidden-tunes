"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/auth";

export default function AdminResetPasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function checkRecoverySession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session?.user) {
        setHasRecoverySession(true);
        setIsCheckingSession(false);
        return;
      }

      setErrorMessage(
        "This reset link is expired or invalid. Please request a new password reset email."
      );
      setIsCheckingSession(false);
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === "PASSWORD_RECOVERY" || session?.user) {
        setHasRecoverySession(true);
        setErrorMessage("");
        setIsCheckingSession(false);
      }
    });

    const timer = window.setTimeout(checkRecoverySession, 350);

    return () => {
      mounted = false;
      window.clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  async function handleUpdatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!hasRecoverySession) {
      setErrorMessage(
        "This reset link is expired or invalid. Please request a new password reset email."
      );
      return;
    }

    if (!newPassword) {
      setErrorMessage("Enter a new password.");
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Password confirmation does not match.");
      return;
    }

    setIsUpdating(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setErrorMessage(
          "This reset link is expired or invalid. Please request a new password reset email."
        );
        return;
      }

      setSuccessMessage("Password updated successfully.");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setErrorMessage("Password could not be updated. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050508] px-4 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.16),transparent_30%),radial-gradient(circle_at_90%_0%,rgba(168,85,247,0.1),transparent_24%),linear-gradient(180deg,#050508,#08080d_52%,#030305)]" />

      <section className="relative w-full max-w-xl rounded-[2.4rem] border border-white/10 bg-white/[0.045] p-6 shadow-[0_30px_110px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.32em] text-yellow-300">
          Hidden Tunes Admin
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.05em]">
          Reset password
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/55">
          Choose a new password for your admin account. This page only works
          from a valid Supabase password recovery link.
        </p>

        {isCheckingSession ? (
          <div className="mt-7 rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-sm font-bold text-white/55">
            Verifying secure recovery session...
          </div>
        ) : (
          <form onSubmit={handleUpdatePassword} className="mt-7 flex flex-col gap-4">
            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-widest text-white/40">
                New password
              </span>
              <input
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  setErrorMessage("");
                  setSuccessMessage("");
                }}
                type="password"
                minLength={8}
                disabled={!hasRecoverySession || isUpdating || Boolean(successMessage)}
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-widest text-white/40">
                Confirm password
              </span>
              <input
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setErrorMessage("");
                  setSuccessMessage("");
                }}
                type="password"
                minLength={8}
                disabled={!hasRecoverySession || isUpdating || Boolean(successMessage)}
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>

            {errorMessage ? <Notice tone="error" message={errorMessage} /> : null}
            {successMessage ? (
              <Notice tone="success" message={successMessage} />
            ) : null}

            <button
              disabled={!hasRecoverySession || isUpdating || Boolean(successMessage)}
              className="rounded-2xl bg-yellow-300 px-5 py-4 text-sm font-black text-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUpdating ? "Updating password..." : "Update Password"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/admin/login")}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm font-black text-white/72 transition hover:border-yellow-300/25 hover:text-yellow-100"
            >
              Back to Login
            </button>
          </form>
        )}
      </section>
    </main>
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
