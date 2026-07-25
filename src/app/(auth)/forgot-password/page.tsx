'use client';

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/api/auth/callback?next=/reset-password`;
      
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo }
      );

      if (resetError) {
        if (resetError.status === 429) {
          setError("Rate limit exceeded. Please try again in a few minutes.");
          setLoading(false);
          return;
        }
        console.error("Reset error:", resetError);
      }

      // Generic message to prevent user enumeration
      setMessage("If that email exists on our platform, a password reset link has been sent to it.");
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 p-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950/50 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white font-sans">Forgot Password</h1>
          <p className="text-sm text-neutral-400">
            Enter your email to receive a password reset link
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {error && (
            <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-lg border border-emerald-900/30 bg-emerald-950/20 p-3 text-sm text-emerald-400 font-sans">
              {message}
            </div>
          )}

          {!message && (
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

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-white py-2.5 text-neutral-950 hover:bg-neutral-200 transition-colors h-11 text-sm font-medium"
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </Button>
            </div>
          )}

          <p className="text-center text-sm text-neutral-400 mt-4">
            Back to{" "}
            <Link
              href="/login"
              className="font-medium text-white hover:underline"
            >
              Sign In
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
