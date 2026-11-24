'use client';

import Link from "next/link";
import { Home, ArrowUpRight } from "lucide-react";

export function LandingFooter() {
  const handleScrollTo = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    if (typeof window !== "undefined" && (window.location.pathname === "/" || window.location.pathname === "")) {
      const el = document.getElementById(targetId);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: "smooth" });
        window.history.pushState(null, "", `#${targetId}`);
      }
    }
  };

  return (
    <footer className="landing-footer text-[#EEF0F5] pt-24 pb-9 relative overflow-hidden">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        {/* Top CTA Area */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
          <div className="max-w-[680px]">
            <span className="text-[12px] font-bold tracking-[0.14em] text-[#C9A23A] uppercase">
              READY WHEN YOU ARE
            </span>
            <h2 className="text-[clamp(34px,5vw,60px)] leading-[1.05] tracking-[-0.03em] font-bold text-[#EEF0F5] mt-3 font-sans">
              Bring every property into{" "}
              <span className="font-serif italic font-normal text-[#C9A23A]">one calm place.</span>
            </h2>
          </div>

          <div className="shrink-0">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 h-12 px-7 rounded-full bg-[#C9A23A] hover:bg-[#B89230] text-[#1A1405] font-semibold text-[15px] transition-colors shadow-sm"
            >
              <span>Sign up your first property</span>
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* 1px Divider */}
        <div className="border-t border-[rgb(255_255_255_/_0.12)] my-14 lg:my-16" />

        {/* 4 Columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
          {/* 1. Brand */}
          <div className="space-y-4">
            <Link href="/" className="inline-flex items-center gap-3">
              <div className="w-[30px] h-[30px] rounded-lg bg-[#0E1E45] border border-[rgb(255_255_255_/_0.15)] flex items-center justify-center shrink-0 shadow-sm">
                <Home className="w-4 h-4 text-[#C9A23A]" />
              </div>
              <span className="text-[20px] font-extrabold tracking-tight text-[#EEF0F5] font-sans">
                PropLink
              </span>
            </Link>
            <p className="text-[15px] text-[rgb(238_240_245_/_0.6)] leading-relaxed max-w-[280px]">
              Leases, rent and tenants for landlords, in one calm place.
            </p>
          </div>

          {/* 2. Product */}
          <div>
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[#EEF0F5] mb-4">
              Product
            </h3>
            <ul className="space-y-3 text-[15px]">
              <li>
                <Link
                  href="/#landlords"
                  onClick={(e) => handleScrollTo(e, "landlords")}
                  className="text-[rgb(238_240_245_/_0.6)] hover:text-[#EEF0F5] transition-colors"
                >
                  For landlords
                </Link>
              </li>
              <li>
                <Link
                  href="/#tenants"
                  onClick={(e) => handleScrollTo(e, "tenants")}
                  className="text-[rgb(238_240_245_/_0.6)] hover:text-[#EEF0F5] transition-colors"
                >
                  For tenants
                </Link>
              </li>
              <li>
                <Link
                  href="/#how-it-works"
                  onClick={(e) => handleScrollTo(e, "how-it-works")}
                  className="text-[rgb(238_240_245_/_0.6)] hover:text-[#EEF0F5] transition-colors"
                >
                  How it works
                </Link>
              </li>
              <li>
                <Link
                  href="/#faq"
                  onClick={(e) => handleScrollTo(e, "faq")}
                  className="text-[rgb(238_240_245_/_0.6)] hover:text-[#EEF0F5] transition-colors"
                >
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* 3. Account */}
          <div>
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[#EEF0F5] mb-4">
              Account
            </h3>
            <ul className="space-y-3 text-[15px]">
              <li>
                <Link
                  href="/login"
                  className="text-[rgb(238_240_245_/_0.6)] hover:text-[#EEF0F5] transition-colors"
                >
                  Sign in
                </Link>
              </li>
              <li>
                <Link
                  href="/signup"
                  className="text-[rgb(238_240_245_/_0.6)] hover:text-[#EEF0F5] transition-colors"
                >
                  Create account
                </Link>
              </li>
            </ul>
          </div>

          {/* 4. Legal */}
          <div>
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[#EEF0F5] mb-4">
              Legal
            </h3>
            <ul className="space-y-3 text-[15px]">
              <li>
                <Link
                  href="/privacy"
                  className="text-[rgb(238_240_245_/_0.6)] hover:text-[#EEF0F5] transition-colors"
                >
                  Privacy policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-[rgb(238_240_245_/_0.6)] hover:text-[#EEF0F5] transition-colors"
                >
                  Terms of use
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="border-t border-[rgb(255_255_255_/_0.08)] mt-14 pt-8">
          <p className="text-[14px] text-[rgb(238_240_245_/_0.6)]">
            © 2026 PropLink. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
