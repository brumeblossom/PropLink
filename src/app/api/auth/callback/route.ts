import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const userRole = user.user_metadata?.role;
        const redirectUrl = userRole === "tenant" ? "/tenant" : "/landlord";
        return NextResponse.redirect(`${origin}${redirectUrl}`);
      }
    }
  }

  // Redirect to login page on auth failure
  return NextResponse.redirect(`${origin}/login?error=auth-code-error`);
}
