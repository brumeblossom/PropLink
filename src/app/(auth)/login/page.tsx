'use client';

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const resetSuccess = searchParams.get("reset") === "success";
  const registeredSuccess = searchParams.get("registered") === "true";
  const authCodeError = searchParams.get("error") === "auth-code-error";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loginMutation = trpc.auth.login.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await loginMutation.mutateAsync({ email, password });
      if (res.user.role === "landlord") {
        router.push("/landlord");
      } else {
        router.push("/tenant");
      }
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid credentials. Please try again.";
      setError(message);
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 p-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950/50 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white font-sans">PropLink</h1>
          <p className="text-sm text-neutral-400">
            Sign in to manage your properties and leases
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {resetSuccess && (
            <div className="rounded-lg border border-emerald-900/30 bg-emerald-950/20 p-3 text-sm text-emerald-400">
              Password reset successful! You can now sign in with your new password.
            </div>
          )}

          {registeredSuccess && (
            <div className="rounded-lg border border-emerald-900/30 bg-emerald-950/20 p-3 text-sm text-emerald-400">
              Registration successful! Please sign in below.
            </div>
          )}

          {authCodeError && (
            <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-3 text-sm text-red-400">
              The verification link was invalid, expired, or already used.
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-neutral-300"
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
                className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-2.5 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <div className="flex justify-between items-center">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-neutral-300"
                >
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-neutral-400 hover:text-white transition-colors hover:underline font-sans"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-lg border border-neutral-800 bg-neutral-900/50 pl-4 pr-10 py-2.5 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-white transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-white py-2.5 text-neutral-950 hover:bg-neutral-200 transition-colors h-11 text-sm font-medium"
          >
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-neutral-400">
          New landlord?{" "}
          <Link
            href="/signup"
            className="font-medium text-white hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-white">
        <p className="text-lg">Loading sign in...</p>
      </main>
    }>
      <LoginForm />
    </Suspense>
  );
}
