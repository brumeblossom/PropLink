'use client';

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary-tint flex items-center justify-center text-primary mb-6 shadow-sm">
        <AlertTriangle className="w-7 h-7" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Something went wrong
      </h1>
      <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-[380px]">
        Please try again. If it keeps happening, contact support.
      </p>
      <div className="mt-8 flex items-center justify-center gap-4">
        <Button onClick={() => reset()} size="action">
          Try again
        </Button>
        <Link
          href="/"
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
