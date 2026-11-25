import Link from "next/link";
import { MapPinOff } from "lucide-react";
import { createClient } from "@/utils/supabase/server";

export default async function NotFound() {
  let dashboardHref: string | null = null;
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const role = user.user_metadata?.role;
      dashboardHref = role === "tenant" ? "/tenant" : "/landlord";
    }
  } catch {
    dashboardHref = null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary-tint flex items-center justify-center text-primary mb-6 shadow-sm">
        <MapPinOff className="w-7 h-7" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Page not found
      </h1>
      <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-[380px]">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <div className="mt-8">
        {dashboardHref ? (
          <Link
            href={dashboardHref}
            className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-colors shadow-sm"
          >
            Go to dashboard
          </Link>
        ) : (
          <Link
            href="/"
            className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-colors shadow-sm"
          >
            Back to home
          </Link>
        )}
      </div>
    </div>
  );
}
