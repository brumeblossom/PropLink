'use client';

import { useState } from "react";
import Link from "next/link";
import { Home, Menu, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

export function LandingNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleScrollTo = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    if (typeof window !== "undefined" && (window.location.pathname === "/" || window.location.pathname === "")) {
      const el = document.getElementById(targetId);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: "smooth" });
        window.history.pushState(null, "", `#${targetId}`);
      }
    }
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-background/90 backdrop-blur-md">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-[72px] flex items-center justify-between">
        {/* Left: Logo & Nav items */}
        <div className="flex items-center gap-10">
          <Link href="/" className="flex items-center gap-3 shrink-0 hover:opacity-90 transition-opacity">
            <div className="w-[32px] h-[32px] rounded-lg bg-[#0E1E45] flex items-center justify-center shrink-0 shadow-sm">
              <Home className="w-4 h-4 text-[#C9A23A]" />
            </div>
            <span className="text-[20px] font-extrabold tracking-tight text-foreground font-sans">
              PropLink
            </span>
          </Link>

          {/* Desktop links - hidden under 860px */}
          <nav className="hidden min-[860px]:flex items-center gap-[28px]">
            <Link
              href="/#landlords"
              onClick={(e) => handleScrollTo(e, "landlords")}
              className="text-[15px] text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              For landlords
            </Link>
            <Link
              href="/#tenants"
              onClick={(e) => handleScrollTo(e, "tenants")}
              className="text-[15px] text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              For tenants
            </Link>
            <Link
              href="/#how-it-works"
              onClick={(e) => handleScrollTo(e, "how-it-works")}
              className="text-[15px] text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              How it works
            </Link>
            <Link
              href="/#faq"
              onClick={(e) => handleScrollTo(e, "faq")}
              className="text-[15px] text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              FAQ
            </Link>
          </nav>
        </div>

        {/* Right: Auth buttons - hidden under 860px */}
        <div className="hidden min-[860px]:flex items-center gap-6 ml-auto">
          <Link
            href="/login"
            className="text-[15px] font-medium text-foreground hover:text-primary transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="h-10 px-5 rounded-full bg-primary text-primary-foreground font-medium text-[15px] flex items-center justify-center hover:opacity-90 transition-opacity shadow-sm"
          >
            Get started
          </Link>
        </div>

        {/* Under 860px: Menu button */}
        <div className="flex min-[860px]:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="p-2 -mr-2 text-foreground hover:text-muted-foreground transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Mobile Drawer Sheet */}
      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-full max-w-[320px] bg-background border-l border-border p-6 shadow-2xl flex flex-col justify-between data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-200">
            <div>
              <div className="flex items-center justify-between pb-6 border-b border-border">
                <Link
                  href="/"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5"
                >
                  <div className="w-[30px] h-[30px] rounded-lg bg-[#0E1E45] flex items-center justify-center shrink-0 shadow-sm">
                    <Home className="w-4 h-4 text-[#C9A23A]" />
                  </div>
                  <span className="text-[19px] font-extrabold tracking-tight text-foreground font-sans">
                    PropLink
                  </span>
                </Link>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Close menu"
                    className="p-1.5 -mr-1 text-muted-foreground hover:text-foreground rounded-md transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </Dialog.Close>
              </div>

              <nav className="flex flex-col gap-4 mt-8">
                <Link
                  href="/#landlords"
                  onClick={(e) => handleScrollTo(e, "landlords")}
                  className="text-[17px] font-medium text-muted-foreground hover:text-foreground py-1.5 transition-colors"
                >
                  For landlords
                </Link>
                <Link
                  href="/#tenants"
                  onClick={(e) => handleScrollTo(e, "tenants")}
                  className="text-[17px] font-medium text-muted-foreground hover:text-foreground py-1.5 transition-colors"
                >
                  For tenants
                </Link>
                <Link
                  href="/#how-it-works"
                  onClick={(e) => handleScrollTo(e, "how-it-works")}
                  className="text-[17px] font-medium text-muted-foreground hover:text-foreground py-1.5 transition-colors"
                >
                  How it works
                </Link>
                <Link
                  href="/#faq"
                  onClick={(e) => handleScrollTo(e, "faq")}
                  className="text-[17px] font-medium text-muted-foreground hover:text-foreground py-1.5 transition-colors"
                >
                  FAQ
                </Link>
              </nav>
            </div>

            <div className="pt-6 border-t border-border flex flex-col gap-3">
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="w-full h-11 rounded-full border border-border flex items-center justify-center text-[15px] font-medium text-foreground hover:bg-muted transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                onClick={() => setMobileOpen(false)}
                className="w-full h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[15px] font-medium hover:opacity-90 transition-opacity shadow-sm"
              >
                Get started
              </Link>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </header>
  );
}
