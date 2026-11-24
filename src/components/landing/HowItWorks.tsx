'use client';

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const landlordSteps = [
  {
    step: "01",
    title: "Add your property",
    text: "Name it, pick the type and add your units. Takes two minutes.",
  },
  {
    step: "02",
    title: "Invite your tenant",
    text: "Share a 6-character code or send an email. They join and see their rent.",
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
    text: "Your landlord gives you a code or invites your email.",
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
    text: "Every receipt is saved. No more lost payment records.",
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
              four calm steps.
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
          {steps.map((item, index) => (
            <div
              key={item.step}
              className="relative group p-6 rounded-2xl transition-colors duration-200 hover:bg-white/5 border border-transparent hover:border-white/10 flex flex-col items-start"
            >
              {/* Dashed connector line between steps on desktop */}
              {index < 3 && (
                <div
                  aria-hidden="true"
                  className="hidden lg:block absolute top-[46px] left-[calc(44px+24px+12px)] right-[-12px] border-t border-dashed border-white/15 pointer-events-none"
                />
              )}

              {/* Step number in 44px circle */}
              <div className="w-[44px] h-[44px] rounded-full border border-[#D4AF37]/40 group-hover:border-[#D4AF37]/60 text-[#D4AF37] font-mono font-bold text-base flex items-center justify-center shrink-0 transition-colors z-10 bg-[#0E1E45] dark:bg-[#1A1810]">
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
