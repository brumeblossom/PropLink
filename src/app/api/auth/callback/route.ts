import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/prisma";
import { redeemInvite } from "@/server/services/redeemInvite";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get("next");
  const intent = searchParams.get("intent");
  const roleParam = searchParams.get("role");

  // In Supabase OAuth callback, searchParams contains 'code' which is the PKCE/auth exchange code.
  // If ?code was also passed in redirectTo, searchParams.getAll("code") will hold all values.
  const codes = searchParams.getAll("code");
  // The OAuth auth code to exchange with Supabase is the last one
  const authCode = codes.length > 1 ? codes[codes.length - 1] : codes[0];

  if (!authCode) {
    return NextResponse.redirect(`${origin}/login?error=auth-code-error`);
  }

  const supabase = createClient();
  let exchangeError = (await supabase.auth.exchangeCodeForSession(authCode)).error;

  if (exchangeError && codes.length > 1) {
    // Try the other code if multiple existed
    const retry = await supabase.auth.exchangeCodeForSession(codes[0]);
    exchangeError = retry.error;
  }

  if (exchangeError) {
    console.error("Auth callback exchangeCodeForSession error:", exchangeError);
    return NextResponse.redirect(`${origin}/login?error=auth-code-error`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.redirect(`${origin}/login?error=auth-code-error`);
  }

  // a. Look up the Prisma user by the Supabase user id.
  const prismaUserById = await prisma.user.findUnique({
    where: { id: user.id },
  });

  // f. If a Prisma user already exists with the same email but a different id (signed up with password earlier)
  if (!prismaUserById) {
    const prismaUserByEmail = await prisma.user.findUnique({
      where: { email: user.email },
    });

    if (prismaUserByEmail && prismaUserByEmail.id !== user.id) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=use-password`);
    }
  }

  // b. If one exists: redirect to /landlord or /tenant by its role (honour ?next).
  if (prismaUserById) {
    if (next) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    const redirectUrl = prismaUserById.role === "tenant" ? "/tenant" : "/landlord";
    return NextResponse.redirect(`${origin}${redirectUrl}`);
  }

  // If next is /reset-password (e.g. from password recovery email), allow through
  if (next === "/reset-password") {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // c. If none and role=landlord: create the Prisma user (role landlord, fullName from user_metadata.full_name or name, email),
  // call supabase.auth.updateUser({ data: { role: "landlord", full_name } }) so middleware sees the role, then redirect to /landlord.
  if (roleParam === "landlord") {
    const fullName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email.split("@")[0] ||
      "Landlord";

    try {
      await prisma.user.create({
        data: {
          id: user.id,
          email: user.email,
          role: "landlord",
          fullName,
        },
      });

      await supabase.auth.updateUser({
        data: {
          role: "landlord",
          full_name: fullName,
        },
      });

      return NextResponse.redirect(`${origin}/landlord`);
    } catch (err) {
      console.error("Error creating landlord user in OAuth callback:", err);
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/signup?error=create-account-failed`);
    }
  }

  // d. If none and role=tenant with a code:
  // Validate code, create Prisma user as tenant, link to lease, mark code redeemed, notify landlord.
  // Then updateUser role "tenant" and redirect to /tenant.
  // If the code fails, sign out and redirect to /signup?role=tenant&error=invite with the reason.
  if (roleParam === "tenant") {
    const inviteCode = searchParams.get("inviteCode") || (codes.length > 1 ? codes[0] : null);

    if (!inviteCode) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/signup?role=tenant&error=no-code`);
    }

    const fullName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email.split("@")[0] ||
      "Tenant";

    const result = await redeemInvite({
      code: inviteCode,
      userId: user.id,
      email: user.email,
      fullName,
    });

    if (!result.success) {
      await supabase.auth.signOut();
      const reasonParam = encodeURIComponent(result.reason || result.error || "invalid");
      return NextResponse.redirect(
        `${origin}/signup?role=tenant&error=invite&reason=${reasonParam}`
      );
    }

    await supabase.auth.updateUser({
      data: {
        role: "tenant",
        full_name: fullName,
      },
    });

    return NextResponse.redirect(`${origin}/tenant`);
  }

  // e. If none and intent=signin (no PropLink account yet):
  // sign out and redirect to /signup?error=no-account.
  if (intent === "signin" || !roleParam) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/signup?error=no-account`);
  }

  // Fallback
  return NextResponse.redirect(`${origin}/login`);
}
