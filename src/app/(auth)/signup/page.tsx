'use client';

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/utils/trpc";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Check, Loader2 } from "lucide-react";
import { PasswordChecklist, isPasswordValid } from "@/components/auth/PasswordChecklist";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

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

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const codeParam = searchParams.get("code") || "";
  const roleParam = searchParams.get("role");

  const [role, setRole] = useState<"landlord" | "tenant">(
    roleParam === "tenant" || codeParam ? "tenant" : "landlord"
  );
  const [inviteCode, setInviteCode] = useState(codeParam);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const err = searchParams.get("error");
    const reason = searchParams.get("reason");

    if (err === "no-account") {
      setRole("landlord");
      setError(
        "There's no PropLink account for this Google email yet. Landlords can sign up below. Tenants, use the invite code from your landlord."
      );
    } else if (codeParam) {
      setRole("tenant");
      setInviteCode(codeParam);
    } else if (roleParam === "tenant") {
      setRole("tenant");
    }

    if (err === "invite") {
      if (reason === "expired") {
        setError("This invite code has expired. Ask your landlord for a new one.");
      } else if (reason === "used") {
        setError("This invite code has already been redeemed.");
      } else if (reason === "not_found") {
        setError("This invite code was not found. Ask your landlord for a new one.");
      } else if (reason === "email_mismatch") {
        setError(
          "The email address on your Google account does not match the one registered with this invite code."
        );
      } else {
        setError("Invalid invite code. Ask your landlord for a new one.");
      }
    } else if (err === "no-code") {
      setError("Please enter an invite code to sign up as a tenant.");
    }

    if (err) {
      window.history.replaceState(
        {},
        "",
        "/signup" + (err === "no-account" ? "" : roleParam === "tenant" || codeParam ? "?role=tenant" : "")
      );
    }
  }, [codeParam, roleParam, searchParams]);

  const signupLandlordMutation = trpc.auth.signupLandlord.useMutation();
  const signupTenantMutation = trpc.auth.signupTenant.useMutation();

  const allRulesPass = isPasswordValid(password);
  const passwordsMatch = Boolean(password && confirmPassword && password === confirmPassword);
  const isCodeFilled = role === "landlord" || Boolean(inviteCode.trim());
  const canSubmit =
    Boolean(fullName.trim()) &&
    Boolean(email.trim()) &&
    allRulesPass &&
    passwordsMatch &&
    isCodeFilled &&
    !loading;

  const getDisabledReason = () => {
    if (role === "tenant" && !inviteCode.trim()) return "Enter your invite code";
    if (!fullName.trim()) return "Enter your full name";
    if (!email.trim()) return "Enter your email address";
    if (!allRulesPass) return "Meet all password requirements";
    if (!passwordsMatch) return "Passwords must match";
    return "Fill all required fields";
  };

  const handleGoogleSignUp = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/api/auth/callback?intent=signup&role=landlord`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (oauthError) {
        setError(oauthError.message);
        setGoogleLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign up with Google.");
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setLoading(true);

    try {
      if (role === "landlord") {
        await signupLandlordMutation.mutateAsync({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
        });
        router.push("/login?registered=true");
      } else {
        await signupTenantMutation.mutateAsync({
          inviteCode: inviteCode.trim(),
          email: email.trim(),
          password,
          fullName: fullName.trim(),
        });
        router.push("/tenant");
        router.refresh();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to register. Please check details.";
      setError(message);
      setLoading(false);
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div>
        <div className="flex flex-col space-y-1.5">
          <h1 className="text-[34px] font-extrabold tracking-tight text-foreground font-sans leading-tight">
            Create your account
          </h1>
          <p className="text-sm text-muted-foreground font-sans">
            {role === "landlord"
              ? "Create a landlord account to manage your properties."
              : "Claim your invite code to see your lease and payments."}
          </p>
        </div>

        {/* Segmented Control Tabs (44px) */}
        <div className="h-11 rounded-lg bg-muted p-1 flex items-center gap-1 w-full mt-6">
          <button
            type="button"
            onClick={() => {
              setRole("landlord");
              setError(null);
            }}
            className={cn(
              "flex-1 h-full rounded-md text-xs sm:text-sm font-semibold transition-all flex items-center justify-center",
              role === "landlord"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            I am a Landlord
          </button>
          <button
            type="button"
            onClick={() => {
              setRole("tenant");
              setError(null);
            }}
            className={cn(
              "flex-1 h-full rounded-md text-xs sm:text-sm font-semibold transition-all flex items-center justify-center",
              role === "tenant"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            I am a Tenant
          </button>
        </div>

        {/* Landlord tab only: Continue with Google + "or" divider */}
        {role === "landlord" && (
          <>
            <div className="mt-6">
              <button
                type="button"
                onClick={handleGoogleSignUp}
                disabled={googleLoading || loading}
                className="w-full h-12 rounded-lg bg-card border border-border font-semibold text-sm text-foreground flex items-center justify-center gap-3 hover:bg-accent transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {googleLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                ) : (
                  <GoogleIcon className="w-[18px] h-[18px]" />
                )}
                <span>Continue with Google</span>
              </button>
            </div>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-background px-3 text-subtle-foreground font-medium">or</span>
              </div>
            </div>
          </>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className={cn("space-y-4", role === "tenant" && "mt-6")}>
          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive-tint p-3 text-sm text-destructive font-medium">
              {error}
            </div>
          )}

          {/* Tenant tab only: Invite code first */}
          {role === "tenant" && (
            <div className="space-y-2">
              <label htmlFor="inviteCode" className="block text-sm font-semibold text-foreground">
                Invite code
              </label>
              <input
                id="inviteCode"
                name="inviteCode"
                type="text"
                required
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                className="block w-full h-12 rounded-lg field-focus px-4 font-mono uppercase text-foreground placeholder:text-subtle-foreground text-sm tracking-wider"
                placeholder="E.G. PRO-1234"
              />
            </div>
          )}

          {/* Full Name */}
          <div className="space-y-2">
            <label htmlFor="fullName" className="block text-sm font-semibold text-foreground">
              Full name
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="block w-full h-12 rounded-lg field-focus px-4 text-foreground placeholder:text-subtle-foreground text-sm"
              placeholder="Adekunle Ciroma"
            />
          </div>

          {/* Email Address */}
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
              className="block w-full h-12 rounded-lg field-focus px-4 text-foreground placeholder:text-subtle-foreground text-sm"
              placeholder="you@example.com"
            />
          </div>

          {/* Password */}
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-semibold text-foreground">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full h-12 rounded-lg field-focus px-4 pr-12 text-foreground placeholder:text-subtle-foreground text-sm"
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
            <PasswordChecklist password={password} className="mt-2.5" />
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="block text-sm font-semibold text-foreground">
              Confirm password
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="block w-full h-12 rounded-lg field-focus px-4 pr-12 text-foreground placeholder:text-subtle-foreground text-sm"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-muted-foreground hover:text-foreground"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {passwordsMatch && (
              <div className="flex items-center gap-1.5 text-xs text-success font-medium mt-1.5">
                <Check className="w-3.5 h-3.5" />
                <span>Passwords match</span>
              </div>
            )}
          </div>

          {/* Create Account Button */}
          <div className="pt-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block w-full">
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="w-full h-[50px] rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        <span>Creating account...</span>
                      </>
                    ) : (
                      <span>Create account</span>
                    )}
                  </button>
                </span>
              </TooltipTrigger>
              {!canSubmit && (
                <TooltipContent side="top">
                  {getDisabledReason()}
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        </form>

        {/* Terms notice */}
        <p className="mt-4 text-center text-[13px] text-muted-foreground leading-relaxed">
          By creating an account you agree to our{" "}
          <Link href="/terms" className="underline hover:text-foreground">
            Terms of use
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline hover:text-foreground">
            Privacy policy
          </Link>
          .
        </p>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary font-semibold hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>}>
      <SignupForm />
    </Suspense>
  );
}
