'use client';

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const codeParam = searchParams.get("code") || "";

  const [role, setRole] = useState<"landlord" | "tenant">("landlord");
  const [inviteCode, setInviteCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Switch role and prefill code if code is present in URL params
  useEffect(() => {
    if (codeParam) {
      setRole("tenant");
      setInviteCode(codeParam);
    }
  }, [codeParam]);

  const signupLandlordMutation = trpc.auth.signupLandlord.useMutation();
  const signupTenantMutation = trpc.auth.signupTenant.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (role === "landlord") {
        await signupLandlordMutation.mutateAsync({
          email,
          password,
          fullName,
          phone: phone || undefined,
        });
        router.push("/login?registered=true");
      } else {
        await signupTenantMutation.mutateAsync({
          inviteCode: inviteCode.trim(),
          email,
          password,
          fullName,
          phone: phone || undefined,
        });
        router.push("/tenant");
        router.refresh();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to register. Please check details.";
      setError(message);
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 p-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950/50 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white font-sans">
            PropLink
          </h1>
          <p className="text-sm text-neutral-400">
            {role === "landlord"
              ? "Create a landlord account to manage your properties"
              : "Claim your invite code to access your lease agreement"}
          </p>
        </div>

        {/* Role Toggle Selector */}
        <div className="mt-6 flex rounded-lg bg-neutral-900/80 p-1 border border-neutral-800/80">
          <button
            type="button"
            onClick={() => {
              setRole("landlord");
              setError(null);
            }}
            className={`w-1/2 rounded-md py-1.5 text-xs font-semibold transition-all ${
              role === "landlord"
                ? "bg-white text-neutral-950 shadow"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            I am a Landlord
          </button>
          <button
            type="button"
            onClick={() => {
              setRole("tenant");
              setError(null);
            }}
            className={`w-1/2 rounded-md py-1.5 text-xs font-semibold transition-all ${
              role === "tenant"
                ? "bg-white text-neutral-950 shadow"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            I am a Tenant
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-3">
            {/* Invite Code Field (Tenants only) */}
            {role === "tenant" && (
              <div>
                <label
                  htmlFor="inviteCode"
                  className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider"
                >
                  Invite Code
                </label>
                <input
                  id="inviteCode"
                  name="inviteCode"
                  type="text"
                  required
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm font-mono tracking-widest"
                  placeholder="PL-XXXXXX"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="fullName"
                className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider"
              >
                Full Name
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider"
              >
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="phone"
                className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider"
              >
                Phone Number (optional)
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                placeholder="+234..."
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                placeholder="Min. 6 characters"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-white mt-6 py-2 text-neutral-950 hover:bg-neutral-200 transition-colors"
          >
            {loading ? "Registering..." : "Create Account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-neutral-400">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-white hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-white">
        <p className="text-lg animate-pulse">Loading signup...</p>
      </div>
    }>
      <SignupForm />
    </Suspense>
  );
}
