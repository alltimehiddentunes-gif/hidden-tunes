"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getActiveUploaderSession, signInUploader, supabase } from "@/lib/auth";

const ADMIN_RESET_REDIRECT_URL =
  "https://admin.hiddentunes.com/admin/reset-password";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@hiddentunes.com");
  const [password, setPassword] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [error, setError] = useState("");
  const [resetMessage, setResetMessage] = useState("");

  const cleanedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  useEffect(() => {
    async function checkExistingSession() {
      const { profile } = await getActiveUploaderSession();

      if (profile) {
        router.replace("/admin/upload");
        return;
      }

      setIsCheckingSession(false);
    }

    checkExistingSession();
  }, [router]);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSigningIn(true);
    setError("");
    setResetMessage("");

    const { data, error: signInError } = await signInUploader(
      cleanedEmail,
      password
    );

    if (signInError || !data.user) {
      setError(signInError?.message || "Login failed");
      setIsSigningIn(false);
      return;
    }

    const { profile } = await getActiveUploaderSession();

    if (!profile) {
      setError(
        "This account is not active for Hidden Tunes Admin. Disabled accounts lose access immediately."
      );
      setIsSigningIn(false);
      return;
    }

    router.replace("/admin/upload");
  }

  async function handleForgotPassword() {
    setError("");
    setResetMessage("");

    if (!cleanedEmail) {
      setError("Enter your email first, then click reset password.");
      return;
    }

    if (!isValidEmail(cleanedEmail)) {
      setError("Enter a valid admin email address.");
      return;
    }

    setIsSendingReset(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        cleanedEmail,
        {
          redirectTo: ADMIN_RESET_REDIRECT_URL,
        }
      );

      if (resetError) {
        setError(resetError.message || "Password reset email could not be sent.");
        return;
      }

      setResetMessage("Password reset link sent. Check your email.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Password reset email could not be sent."
      );
    } finally {
      setIsSendingReset(false);
    }
  }

  if (isCheckingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050508] px-4 text-white">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-8 py-6 text-sm font-bold text-white/60 shadow-2xl">
          Checking secure session...
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050508] px-4 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.16),transparent_30%),radial-gradient(circle_at_90%_0%,rgba(168,85,247,0.1),transparent_24%),linear-gradient(180deg,#050508,#08080d_52%,#030305)]" />

      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-[2.4rem] border border-white/10 bg-white/[0.045] shadow-[0_30px_110px_rgba(0,0,0,0.55)] backdrop-blur-xl lg:grid-cols-[0.95fr_1.05fr]">
        <div className="hidden flex-col justify-between border-r border-white/10 bg-black/20 p-8 lg:flex">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-yellow-300">
              Hidden Tunes
            </p>
            <h1 className="mt-5 text-5xl font-black tracking-[-0.06em]">
              Admin access
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/55">
              Secure sign-in for uploaders, release managers, and music
              operations.
            </p>
          </div>

          <div className="rounded-[2rem] border border-yellow-300/15 bg-yellow-300/[0.07] p-5">
            <p className="text-sm font-black text-yellow-100">
              Production recovery
            </p>
            <p className="mt-2 text-sm leading-6 text-white/55">
              Reset links are sent to the VPS admin domain:
              admin.hiddentunes.com.
            </p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-yellow-300 lg:hidden">
            Hidden Tunes Admin
          </p>
          <h2 className="mt-3 text-4xl font-black tracking-[-0.05em]">
            Secure Login
          </h2>
          <p className="mt-3 text-sm leading-6 text-white/55">
            Sign in with an active admin or uploader account. Disabled accounts
            lose access immediately.
          </p>

          <div className="mt-7 flex flex-col gap-4">
            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-widest text-white/40">
                Email
              </span>
              <input
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                  setResetMessage("");
                }}
                type="email"
                required
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-yellow-300"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-widest text-white/40">
                Password
              </span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                required
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-yellow-300"
              />
            </label>

            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={isSendingReset || isSigningIn}
              className="w-fit rounded-full border border-yellow-300/20 bg-yellow-300/10 px-4 py-2 text-left text-xs font-black uppercase tracking-[0.18em] text-yellow-100 transition hover:-translate-y-0.5 hover:border-yellow-300/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSendingReset
                ? "Sending reset email..."
                : "Forgot password? Reset password"}
            </button>

            {error ? <Notice tone="error" message={error} /> : null}
            {resetMessage ? <Notice tone="success" message={resetMessage} /> : null}

            <button
              disabled={isSigningIn}
              className="rounded-2xl bg-yellow-300 px-5 py-4 text-sm font-black text-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSigningIn ? "Signing in..." : "Sign In"}
            </button>

            <p className="text-center text-xs leading-5 text-white/35">
              Password recovery opens the secure admin reset page on
              admin.hiddentunes.com.
            </p>
          </div>
        </form>
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
