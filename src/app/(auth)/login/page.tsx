'use client';

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/utils/trpc";
import { createClient } from "@/utils/supabase/client";
import { Eye, EyeOff, Loader2 } from "lucide-react";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const loginMutation = trpc.auth.login.useMutation();

  useEffect(() => {
    const errorParam = searchParams.get("error");
    const resetSuccess = searchParams.get("reset") === "success";
    const registeredSuccess = searchParams.get("registered") === "true";

    if (errorParam === "use-password") {
      setError("This email already has a PropLink password. Sign in with your email and password.");
    } else if (errorParam === "auth-code-error") {
      setError("The verification link was invalid, expired, or already used.");
    }

    if (resetSuccess) {
      setSuccessMessage("Password reset successful! You can now sign in with your new password.");
    } else if (registeredSuccess) {
      setSuccessMessage("Registration successful! Please sign in below.");
    }

    // Clean error & status params from URL
    if (errorParam || resetSuccess || registeredSuccess) {
      window.history.replaceState({}, "", "/login");
    }
  }, [searchParams]);

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback?intent=signin`,
        },
      });
      if (oauthError) {
        setError(oauthError.message);
        setGoogleLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign in with Google.");
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await loginMutation.mutateAsync({ email: email.trim(), password });
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
    <div>
      <div className="flex flex-col space-y-1.5">
        <h1 className="text-[34px] font-extrabold tracking-tight text-foreground font-sans leading-tight">
          Welcome back
        </h1>
        <p className="text-sm text-muted-foreground font-sans">
          Sign in to manage your properties or see your rentals.
        </p>
      </div>

      {/* Continue with Google */}
      <div className="mt-8">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading || loading}
          className="w-full h-12 rounded-lg bg-card border border-border font-semibold text-sm text-foreground flex items-center justify-center gap-3 hover:bg-accent transition-colors shadow-sm disabled:opacity-50"
        >
          {googleLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : (
            <GoogleIcon className="w-[18px] h-[18px]" />
          )}
          <span>Continue with Google</span>
        </button>
      </div>

      {/* "or" Divider */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-background px-3 text-subtle-foreground font-medium">or</span>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {successMessage && (
          <div className="rounded-lg border border-success/20 bg-success-tint p-3 text-sm text-success font-medium">
            {successMessage}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive-tint p-3 text-sm text-destructive font-medium">
            {error}
          </div>
        )}

        {/* Email */}
        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-semibold text-foreground">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 text-sm"
            placeholder="you@example.com"
          />
        </div>

        {/* Password */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-semibold text-foreground">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs sm:text-sm font-semibold text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full h-12 rounded-lg border border-input bg-card px-4 pr-12 text-foreground placeholder:text-subtle-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 text-sm"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Sign In Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={!email || !password || loading}
            className="w-full h-[50px] rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                <span>Signing in...</span>
              </>
            ) : (
              <span>Sign in</span>
            )}
          </button>
        </div>
      </form>

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-muted-foreground">
        New to PropLink?{" "}
        <Link href="/signup" className="text-primary font-semibold hover:underline">
          Create an account
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
