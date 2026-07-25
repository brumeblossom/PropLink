import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: "",
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value: "",
            ...options,
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Bypass checks for tRPC API endpoints
  if (pathname.startsWith("/api/trpc")) {
    return response;
  }

  // 1. Protect dashboards (/landlord and /tenant)
  if (pathname.startsWith("/landlord") || pathname.startsWith("/tenant")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    // Role-based routing: ensure user has correct role in metadata
    const userRole = user.user_metadata?.role;
    if (pathname.startsWith("/landlord") && userRole !== "landlord") {
      const url = request.nextUrl.clone();
      url.pathname = userRole === "tenant" ? "/tenant" : "/login";
      return NextResponse.redirect(url);
    }
    if (pathname.startsWith("/tenant") && userRole !== "tenant") {
      const url = request.nextUrl.clone();
      url.pathname = userRole === "landlord" ? "/landlord" : "/login";
      return NextResponse.redirect(url);
    }
  }

  // 2. Redirect authenticated users away from login/signup to their dashboard
  if (pathname === "/login" || pathname === "/signup") {
    if (user) {
      const userRole = user.user_metadata?.role;
      const url = request.nextUrl.clone();
      url.pathname = userRole === "tenant" ? "/tenant" : "/landlord";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (svg, png, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
