"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  getUploaderProfile,
  signInUploader,
  supabase,
} from "@/lib/auth";

export default function AdminLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("admin@hiddentunes.com");
  const [password, setPassword] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function checkExistingSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setIsCheckingSession(false);
        return;
      }

      const { profile } = await getUploaderProfile(session.user.id);

      if (profile?.status === "active") {
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

    const { data, error: signInError } = await signInUploader(
      email,
      password
    );

    if (signInError || !data.user) {
      setError(signInError?.message || "Login failed");
      setIsSigningIn(false);
      return;
    }

    const { profile, error: profileError } =
      await getUploaderProfile(data.user.id);

    if (profileError || !profile || profile.status !== "active") {
      setError("This account is not allowed to access Hidden Tunes Admin.");
      setIsSigningIn(false);
      return;
    }

    router.replace("/admin/upload");
  }

  if (isCheckingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050508] text-white">
        <div className="rounded-3xl border border-white/10 bg-[#101017] px-8 py-6 text-sm text-white/60">
          Checking secure session...
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050508] px-4 text-white">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#101017] p-6 shadow-2xl"
      >
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.3em] text-yellow-400">
          Hidden Tunes Admin
        </p>

        <h1 className="text-3xl font-black">Secure Login</h1>

        <p className="mt-3 text-sm leading-6 text-white/55">
          Sign in with an approved uploader or owner account.
        </p>

        <div className="mt-6 flex flex-col gap-4">
          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-white/45">
              Email
            </span>

            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-yellow-400"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-white/45">
              Password
            </span>

            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              required
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-yellow-400"
            />
          </label>

          {error ? (
            <p className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <button
            disabled={isSigningIn}
            className="rounded-2xl bg-yellow-300 px-5 py-4 text-sm font-black text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSigningIn ? "Signing in..." : "Sign In"}
          </button>
        </div>
      </form>
    </main>
  );
}