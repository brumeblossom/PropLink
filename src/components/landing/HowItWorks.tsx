'use client';

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const landlordSteps = [
  {
    step: "01",
    title: "Add your property",
    text: "Name it, classify and add your units in minutes.",
  },
  {
    step: "02",
    title: "Invite your tenant",
    text: "Share a code or send an email. They join and see their rent.",
  },
  {
    step: "03",
    title: "Tenants log payments",
    text: "They enter the amount, attach the bank receipt and submit.",
  },
  {
    step: "04",
    title: "Confirm in a tap",
    text: "You check the receipt and confirm. Balances update instantly.",
  },
];

const tenantSteps = [
  {
    step: "01",
    title: "Get your invite",
    text: "An email or invite code is shared with you by your landlord.",
  },
  {
    step: "02",
    title: "See what is due",
    text: "Open your dashboard to see your rent, due date and lease details.",
  },
  {
    step: "03",
    title: "Pay and log proof",
    text: "Pay through your usual bank, then upload the receipt in seconds.",
  },
  {
    step: "04",
    title: "Always have proof",
    text: "All your receipts uploaded and safe in one place.",
  },
];

export function HowItWorks() {
  const [activeTab, setActiveTab] = useState<"landlords" | "tenants">("landlords");

  const steps = activeTab === "landlords" ? landlordSteps : tenantSteps;

  return (
    <section
      id="how-it-works"
      className="scroll-mt-[72px] py-[72px] lg:py-[112px] bg-[#0E1E45] dark:bg-[#1A1810] text-white"
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center max-w-[640px] mx-auto">
          <span className="text-[12px] font-bold tracking-[0.14em] text-[#D4AF37] uppercase">
            HOW IT WORKS
          </span>
          <h2 className="text-[clamp(32px,4.4vw,52px)] leading-[1.08] tracking-[-0.025em] font-bold mt-3">
            <span className="block font-sans text-white">Up and running in</span>
            <span className="block font-serif italic font-normal text-[#D4AF37]">
              four steps.
            </span>
          </h2>

          {/* Segmented Switch (44px) */}
          <div className="mt-8 flex justify-center">
            <div className="h-[44px] rounded-full bg-white/10 dark:bg-white/5 p-1 inline-flex items-center gap-1 shadow-inner">
              <button
                type="button"
                onClick={() => setActiveTab("landlords")}
                className={cn(
                  "h-full px-5 rounded-full text-sm font-semibold transition-all duration-200",
                  activeTab === "landlords"
                    ? "bg-[#D4AF37] text-[#1A1405] shadow"
                    : "text-white/75 hover:text-white"
                )}
              >
                For landlords
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("tenants")}
                className={cn(
                  "h-full px-5 rounded-full text-sm font-semibold transition-all duration-200",
                  activeTab === "tenants"
                    ? "bg-[#D4AF37] text-[#1A1405] shadow"
                    : "text-white/75 hover:text-white"
                )}
              >
                For tenants
              </button>
            </div>
          </div>
        </div>

        {/* 4 Steps Grid with Crossfade */}
        <div
          key={activeTab}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6 mt-14 lg:mt-16 transition-opacity duration-300 ease-in-out motion-reduce:transition-none"
        >
          {steps.map((item) => (
            <div
              key={item.step}
              tabIndex={0}
              className="relative group p-6 rounded-2xl bg-white/5 dark:bg-white/[0.04] border border-white/10 transition-all duration-200 hover:-translate-y-1 hover:border-[#D4AF37]/50 focus-visible:outline-none focus-visible:-translate-y-1 focus-visible:border-[#D4AF37]/50 motion-reduce:hover:translate-y-0 motion-reduce:focus-visible:translate-y-0 flex flex-col items-start"
            >
              {/* Step number in 44px circle */}
              <div className="w-[44px] h-[44px] rounded-full border border-[#D4AF37]/40 text-[#D4AF37] font-sans font-bold tabular-nums text-base flex items-center justify-center shrink-0 transition-colors duration-200 z-10 bg-[#0E1E45] dark:bg-[#1A1810] group-hover:bg-[#D4AF37] group-hover:text-[#1A1405] group-hover:border-[#D4AF37] group-focus-visible:bg-[#D4AF37] group-focus-visible:text-[#1A1405] group-focus-visible:border-[#D4AF37]">
                {item.step}
              </div>

              {/* Title & text */}
              <h3 className="text-[18px] font-bold text-white mt-5">
                {item.title}
              </h3>
              <p className="text-[14px] leading-relaxed text-[#D4D8E2] dark:text-[#C8C5BC] mt-2 max-w-[28ch]">
                {item.text}
              </p>
            </div>
          ))}
        </div>

        {/* CTA Button */}
        <div className="mt-14 lg:mt-16 text-center">
          <Link
            href="/signup"
            className="h-12 px-8 rounded-full bg-[#D4AF37] hover:bg-[#B89230] text-[#1A1405] font-semibold text-[15px] inline-flex items-center justify-center transition-colors shadow-sm"
          >
            Get started now
          </Link>
        </div>
      </div>
    </section>
  );
}
