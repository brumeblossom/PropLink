import type { Metadata } from "next";
import Link from "next/link";
import {
  Home,
  ArrowRight,
  Wallet,
  Users,
  Building2,
  Receipt,
  FileText,
  Bell,
} from "lucide-react";
import { LandingImage } from "@/components/landing/LandingImage";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { FaqAccordion } from "@/components/landing/FaqAccordion";

export const metadata: Metadata = {
  title: "PropLink · Property management for landlords and tenants",
  description:
    "Track leases, rent and tenants without spreadsheets or WhatsApp threads. Know who has paid, what is due and when every lease ends.",
  openGraph: {
    title: "PropLink · Property management for landlords and tenants",
    description:
      "Track leases, rent and tenants without spreadsheets or WhatsApp threads. Know who has paid, what is due and when every lease ends.",
    images: [
      {
        url: "/landing/hero.jpg",
        width: 1200,
        height: 630,
        alt: "PropLink Property Management",
      },
    ],
  },
};

export default function LandingPage() {
  return (
    <div className="w-full animate-landing-fade">
      {/* 2. HERO SECTION */}
      <section className="py-[72px] lg:py-[112px]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left Column: Text & Actions */}
            <div>
              {/* Eyebrow */}
              <div className="flex items-center gap-2.5">
                <div className="w-[18px] h-[18px] rounded-[4px] bg-[#C9A23A] flex items-center justify-center shrink-0">
                  <Home className="w-2.5 h-2.5 text-[#1A1405]" />
                </div>
                <span className="text-[12px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                  PROPERTY MANAGEMENT · LANDLORDS &amp; TENANTS
                </span>
              </div>

              {/* H1, 3 lines */}
              <h1 className="text-[clamp(44px,7vw,84px)] leading-[0.98] tracking-[-0.035em] mt-6">
                <span className="block font-sans font-extrabold text-foreground">Your</span>
                <span className="block font-sans font-extrabold text-foreground">properties.</span>
                <span className="block font-serif italic font-normal text-emphasis">One calm place.</span>
              </h1>

              {/* Lead */}
              <p className="text-[20px] font-semibold text-foreground mt-7">
                For landlords with one flat or fifty.
              </p>

              {/* Description */}
              <p className="text-[17px] text-muted-foreground max-w-[48ch] mt-3 leading-relaxed">
                Track leases, rent and tenants without spreadsheets or WhatsApp threads. Know who has paid, what is due and when every lease ends.
              </p>

              {/* Actions - Phones (<640px): stacked full-width */}
              <div className="flex flex-col gap-3 sm:hidden mt-8 w-full">
                <Link
                  href="/signup"
                  className="h-12 w-full rounded-full bg-gold hover:bg-[#B89230] text-gold-foreground font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  <span>Sign up your first property</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/login"
                  className="h-12 w-full rounded-full bg-card border-[1.5px] border-primary/30 dark:border-border text-primary dark:text-foreground font-semibold text-[15px] flex items-center justify-center hover:bg-accent transition-colors"
                >
                  Sign in
                </Link>
              </div>

              {/* Actions - Desktop / Tablet (>=640px) */}
              <div className="hidden sm:flex flex-wrap items-center gap-5 mt-8">
                <Link
                  href="/signup"
                  className="h-[46px] px-7 rounded-full bg-gold hover:bg-[#B89230] text-gold-foreground font-semibold text-[15px] inline-flex items-center gap-2 transition-colors shadow-sm"
                >
                  <span>Sign up your first property</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>

                <Link
                  href="/signup?role=tenant"
                  className="inline-flex items-center gap-1.5 text-[15px] font-medium text-foreground underline decoration-gold decoration-1 underline-offset-4 hover:opacity-80 transition-opacity"
                >
                  <span>I&apos;m a tenant</span>
                  <ArrowRight className="w-4 h-4 text-gold" />
                </Link>
              </div>

              {/* 1px Divider & 2 plain lines */}
              <div className="border-t border-border mt-[44px] pt-[28px] max-w-[520px] flex flex-col gap-[10px]">
                <p className="text-[15px] text-muted-foreground leading-snug">
                  <strong className="text-foreground font-semibold">Rent that adds up.</strong> Every payment counted, every balance right.
                </p>
                <p className="text-[15px] text-muted-foreground leading-snug">
                  <strong className="text-foreground font-semibold">Proof on every payment.</strong> Tenants upload receipts, you confirm in a tap.
                </p>
              </div>
            </div>

            {/* Right Column: Hero Image */}
            <div className="w-full">
              <LandingImage
                src="/landing/hero.jpg"
                alt="PropLink property management overview"
                containerClassName="rounded-[28px] aspect-[4/4.6] shadow-sm w-full"
                priority
                fill
                sizes="(max-width: 1024px) 100vw, 560px"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 3. FOR LANDLORDS SECTION */}
      <section id="landlords" className="bg-muted scroll-mt-[72px] py-[72px] lg:py-[112px]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left Column: Text */}
            <div>
              <span className="text-[12px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                FOR LANDLORDS
              </span>
              <h2 className="text-[clamp(32px,4.4vw,52px)] leading-[1.08] tracking-[-0.025em] mt-4">
                <span className="block font-sans font-bold text-foreground">Know who has paid,</span>
                <span className="block font-serif italic font-normal text-emphasis">without chasing anyone.</span>
              </h2>

              <div className="space-y-6 mt-8 lg:mt-10">
                {/* Row 1 */}
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-card border border-border/60 flex items-center justify-center shrink-0 shadow-sm text-gold">
                    <Wallet className="w-5 h-5 text-gold" />
                  </div>
                  <div>
                    <h3 className="text-[17px] font-bold text-foreground">Balances you can trust</h3>
                    <p className="text-[15px] text-muted-foreground mt-1 leading-relaxed">
                      Payments count toward the whole lease, so what is owed and when it is due are always right.
                    </p>
                  </div>
                </div>

                {/* Row 2 */}
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-card border border-border/60 flex items-center justify-center shrink-0 shadow-sm text-gold">
                    <Users className="w-5 h-5 text-gold" />
                  </div>
                  <div>
                    <h3 className="text-[17px] font-bold text-foreground">Tenants who log their own payments</h3>
                    <p className="text-[15px] text-muted-foreground mt-1 leading-relaxed">
                      Invite a tenant with a code. They log payments with proof, and you confirm or reject.
                    </p>
                  </div>
                </div>

                {/* Row 3 */}
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-card border border-border/60 flex items-center justify-center shrink-0 shadow-sm text-gold">
                    <Building2 className="w-5 h-5 text-gold" />
                  </div>
                  <div>
                    <h3 className="text-[17px] font-bold text-foreground">Every unit, every year</h3>
                    <p className="text-[15px] text-muted-foreground mt-1 leading-relaxed">
                      Leases, renewals and past tenants stay on record for each unit.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Landlords Image */}
            <div className="w-full">
              <LandingImage
                src="/landing/landlords.jpg"
                alt="PropLink for landlords"
                containerClassName="rounded-3xl aspect-[4/3.6] shadow-sm w-full"
                fill
                sizes="(max-width: 1024px) 100vw, 560px"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 4. FOR TENANTS SECTION */}
      <section id="tenants" className="scroll-mt-[72px] py-[72px] lg:py-[112px]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left Column: Tenants Image (order-1 on phones and desktop) */}
            <div className="order-1 lg:order-1 w-full">
              <LandingImage
                src="/landing/tenants.jpg"
                alt="PropLink for tenants"
                containerClassName="rounded-3xl aspect-[4/3.6] shadow-sm w-full"
                fill
                sizes="(max-width: 1024px) 100vw, 560px"
              />
            </div>

            {/* Right Column: Text (order-2 on phones and desktop) */}
            <div className="order-2 lg:order-2">
              <span className="text-[12px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                FOR TENANTS
              </span>
              <h2 className="text-[clamp(32px,4.4vw,52px)] leading-[1.08] tracking-[-0.025em] mt-4">
                <span className="block font-sans font-bold text-foreground">Your rent, receipts and</span>
                <span className="whitespace-nowrap font-serif italic font-normal text-emphasis">lease, in one place.</span>
              </h2>

              <div className="space-y-6 mt-8 lg:mt-10">
                {/* Row 1 */}
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-card border border-border/60 flex items-center justify-center shrink-0 shadow-sm text-gold">
                    <Receipt className="w-5 h-5 text-gold" />
                  </div>
                  <div>
                    <h3 className="text-[17px] font-bold text-foreground">Log a payment in seconds</h3>
                    <p className="text-[15px] text-muted-foreground mt-1 leading-relaxed">
                      Add the amount and date, attach the receipt, and your landlord confirms it.
                    </p>
                  </div>
                </div>

                {/* Row 2 */}
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-card border border-border/60 flex items-center justify-center shrink-0 shadow-sm text-gold">
                    <FileText className="w-5 h-5 text-gold" />
                  </div>
                  <div>
                    <h3 className="text-[17px] font-bold text-foreground">Your lease, always at hand</h3>
                    <p className="text-[15px] text-muted-foreground mt-1 leading-relaxed">
                      See your lease dates, documents and what is due next.
                    </p>
                  </div>
                </div>

                {/* Row 3 */}
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-card border border-border/60 flex items-center justify-center shrink-0 shadow-sm text-gold">
                    <Bell className="w-5 h-5 text-gold" />
                  </div>
                  <div>
                    <h3 className="text-[17px] font-bold text-foreground">Reminders before rent is due</h3>
                    <p className="text-[15px] text-muted-foreground mt-1 leading-relaxed">
                      Get a notice 7 days and 1 day before each due date.
                    </p>
                  </div>
                </div>
              </div>

              {/* Text link */}
              <div className="mt-8">
                <Link
                  href="/signup?role=tenant"
                  className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-foreground hover:text-primary transition-colors group"
                >
                  <span>Join with an invite code</span>
                  <ArrowRight className="w-4 h-4 text-primary group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* NEW: HOW IT WORKS SECTION */}
      <HowItWorks />

      {/* 5. FAQ SECTION */}
      <section id="faq" className="scroll-mt-[72px] py-[72px] lg:py-[112px]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <div className="text-center max-w-[640px] mx-auto">
            <span className="text-[12px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
              FAQ
            </span>
            <h2 className="text-[clamp(32px,4.4vw,52px)] leading-[1.08] tracking-[-0.025em] mt-4 font-bold">
              <span className="font-sans text-foreground">Questions landlords </span>
              <span className="whitespace-nowrap font-serif italic font-normal text-emphasis">ask us.</span>
            </h2>
          </div>

          <FaqAccordion />
        </div>
      </section>
    </div>
  );
}
