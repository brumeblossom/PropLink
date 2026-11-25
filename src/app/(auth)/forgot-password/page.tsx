'use client';

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Mail, Loader2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (sent && countdown > 0) {
      timer = setTimeout(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [sent, countdown]);

  const sendResetEmail = async (targetEmail: string) => {
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/api/auth/callback?next=/reset-password`;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        targetEmail.trim(),
        { redirectTo }
      );

      if (resetError) {
        if (resetError.status === 429) {
          setError("Rate limit exceeded. Please try again in a few minutes.");
          setLoading(false);
          return false;
        }
        console.error("Reset password error:", resetError);
      }

      setSent(true);
      setCountdown(60);
      return true;
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred. Please try again.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendResetEmail(email);
  };

  const handleResend = async () => {
    if (countdown > 0 || loading) return;
    await sendResetEmail(email);
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center text-center">
        {/* 56px round icon tile */}
        <div className="w-14 h-14 rounded-full bg-primary-tint flex items-center justify-center text-primary mb-4">
          <Mail className="w-7 h-7" />
        </div>

        <h2 className="text-2xl font-bold tracking-tight text-foreground font-sans">
          Check your email
        </h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-[340px]">
          We sent a reset link to <span className="font-semibold text-foreground">{email}</span>. It expires in 1 hour.
        </p>

        {error && (
          <div className="w-full mt-4 rounded-lg border border-destructive/20 bg-destructive-tint p-3 text-sm text-destructive font-medium text-left">
            {error}
          </div>
        )}

        <div className="mt-8 space-y-4 w-full">
          <button
            type="button"
            onClick={handleResend}
            disabled={countdown > 0 || loading}
            className="text-sm font-semibold text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Sending..." : countdown > 0 ? `Resend link (${countdown}s)` : "Resend link"}
          </button>

          <div>
            <Link
              href="/login"
              className="inline-block text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col space-y-1.5">
        <h1 className="text-[34px] font-extrabold tracking-tight text-foreground font-sans leading-tight">
          Reset your password
        </h1>
        <p className="text-sm text-muted-foreground font-sans">
          Enter your email and we&apos;ll send you a link to set a new one.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive-tint p-3 text-sm text-destructive font-medium">
            {error}
          </div>
        )}

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

        <div className="pt-2">
          <button
            type="submit"
            disabled={!email || loading}
            className="w-full h-[50px] rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                <span>Sending...</span>
              </>
            ) : (
              <span>Send reset link</span>
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
