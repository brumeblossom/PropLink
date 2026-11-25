'use client';

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/components/ui/toast";
import { Eye, EyeOff, Check, Loader2 } from "lucide-react";
import { PasswordChecklist, isPasswordValid } from "@/components/auth/PasswordChecklist";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasValidSession, setHasValidSession] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("Invalid or expired password reset link. Please request a new link.");
        setHasValidSession(false);
      } else {
        setHasValidSession(true);
      }
      setSessionChecked(true);
    };

    checkSession();
  }, []);

  const allRulesPass = isPasswordValid(password);
  const passwordsMatch = Boolean(password && confirmPassword && password === confirmPassword);
  const canSubmit = allRulesPass && passwordsMatch && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      toast("Password updated", "success");

      // Redirect to user's dashboard based on metadata role
      const userRole = data.user?.user_metadata?.role;
      const redirectUrl = userRole === "tenant" ? "/tenant" : "/landlord";
      router.push(redirectUrl);
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to reset password. Please try again.";
      setError(message);
      setLoading(false);
    }
  };

  if (!sessionChecked) {
    return (
      <div className="py-12 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Verifying reset session...</p>
      </div>
    );
  }

  if (!hasValidSession) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col space-y-1.5">
          <h1 className="text-[34px] font-extrabold tracking-tight text-foreground font-sans leading-tight">
            Reset password
          </h1>
        </div>

        <div className="rounded-lg border border-destructive/20 bg-destructive-tint p-4 text-sm text-destructive font-medium">
          {error}
        </div>

        <div className="pt-2">
          <Link
            href="/forgot-password"
            className="block w-full h-[50px] rounded-lg bg-primary text-primary-foreground font-semibold text-sm text-center leading-[50px] hover:bg-primary/90 transition-colors shadow-sm"
          >
            Request new reset link
          </Link>
        </div>

        <div className="text-center">
          <Link href="/login" className="text-sm font-semibold text-primary hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col space-y-1.5">
        <h1 className="text-[34px] font-extrabold tracking-tight text-foreground font-sans leading-tight">
          Set a new password
        </h1>
        <p className="text-sm text-muted-foreground font-sans">
          Choose a new password for your PropLink account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive-tint p-3 text-sm text-destructive font-medium">
            {error}
          </div>
        )}

        {/* New Password */}
        <div className="space-y-2">
          <label htmlFor="password" className="block text-sm font-semibold text-foreground">
            New password
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

        {/* Update Password Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full h-[50px] rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                <span>Updating password...</span>
              </>
            ) : (
              <span>Update password</span>
            )}
          </button>
        </div>
      </form>

      <div className="mt-8 text-center">
        <Link href="/login" className="text-sm font-semibold text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
