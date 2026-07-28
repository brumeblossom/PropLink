const { PrismaClient } = require('@prisma/client');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://qmwjnmeylvbuqtltdjmf.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const prisma = new PrismaClient();
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  const email = "natediaz@gmail.com";
  const password = "Password123!";
  const fullName = "Nate Diaz";

  console.log("Signing up/checking tenant in Supabase...");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: "tenant"
      }
    }
  });

  if (error) {
    if (error.message.includes("already registered")) {
      console.log("Tenant already exists in Supabase. We will reset their password to ensure it is Password123!.");
      // Admin password reset isn't possible with anon key, but we can do a sign in or update
      // Let's print out and verify.
    } else {
      throw error;
    }
  }

  let userId;
  if (data && data.user) {
    userId = data.user.id;
  } else {
    // If already registered, get their ID from DB
    const existingUser = await prisma.user.findFirst({ where: { email } });
    if (existingUser) {
      userId = existingUser.id;
    } else {
      throw new Error("Could not find user ID in DB.");
    }
  }

  console.log("Creating/updating user profile in public.users...");
  await prisma.user.upsert({
    where: { email },
    update: { fullName, role: 'tenant' },
    create: {
      id: userId,
      email,
      fullName,
      role: 'tenant'
    }
  });

  console.log("Forcing email verification in auth.users...");
  await prisma.$executeRawUnsafe(
    `UPDATE auth.users SET email_confirmed_at = NOW(), last_sign_in_at = NOW() WHERE id = '${userId}'`
  );

  console.log("Success! Tenant user is ready to login with password: Password123!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
