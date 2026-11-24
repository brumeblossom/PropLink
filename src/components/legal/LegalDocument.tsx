'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LegalSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface LegalDocumentProps {
  title: string;
  lastUpdated: string;
  intro: React.ReactNode;
  sections: LegalSection[];
}

export function LegalDocument({
  title,
  lastUpdated,
  intro,
  sections,
}: LegalDocumentProps) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id || "");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.scrollY + 140;
      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i].id);
        if (el && el.offsetTop <= scrollPos) {
          setActiveId(sections[i].id);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [sections]);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      window.history.pushState(null, "", `#${id}`);
      setActiveId(id);
    }
    setMobileMenuOpen(false);
  };

  return (
    <div className="py-12 lg:py-20">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        {/* Page Header */}
        <div className="border-b border-border pb-8 lg:pb-12">
          <h1 className="text-[clamp(36px,5vw,52px)] font-bold text-foreground font-sans tracking-tight leading-tight">
            {title}
          </h1>
          <p className="text-[15px] text-muted-foreground mt-2">
            Last updated: {lastUpdated}
          </p>
        </div>

        {/* Mobile: Collapsible "On this page" */}
        <div className="lg:hidden mt-6 border border-border rounded-xl bg-card overflow-hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="w-full px-4 py-3.5 flex items-center justify-between text-left text-[15px] font-semibold text-foreground focus:outline-none"
            aria-expanded={mobileMenuOpen}
          >
            <span>On this page</span>
            <ChevronDown
              className={cn(
                "w-4 h-4 text-muted-foreground transition-transform duration-200",
                mobileMenuOpen && "rotate-180"
              )}
            />
          </button>
          {mobileMenuOpen && (
            <nav className="px-4 pb-4 pt-1 border-t border-border flex flex-col space-y-2.5">
              {sections.map((section) => (
                <Link
                  key={section.id}
                  href={`#${section.id}`}
                  onClick={(e) => handleNavClick(e, section.id)}
                  className={cn(
                    "text-[14px] transition-colors py-1",
                    activeId === section.id
                      ? "text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {section.title}
                </Link>
              ))}
            </nav>
          )}
        </div>

        {/* Desktop 2-column layout */}
        <div className="grid lg:grid-cols-[240px_1fr] gap-12 lg:gap-16 items-start mt-10 lg:mt-14">
          {/* Left Column: Sticky Table of Contents */}
          <aside className="hidden lg:block w-[240px] sticky top-28 self-start">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-4">
              On this page
            </h2>
            <nav className="flex flex-col space-y-2 border-l border-border pl-3">
              {sections.map((section) => (
                <Link
                  key={section.id}
                  href={`#${section.id}`}
                  onClick={(e) => handleNavClick(e, section.id)}
                  className={cn(
                    "text-[14px] leading-snug py-1 transition-colors block",
                    activeId === section.id
                      ? "text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {section.title}
                </Link>
              ))}
            </nav>
          </aside>

          {/* Right Column: Main Content */}
          <main className="max-w-[68ch] text-[16px] leading-[1.7] text-foreground/90">
            {intro && <div className="mb-8 leading-[1.7]">{intro}</div>}

            {sections.map((section) => (
              <section key={section.id} className="scroll-mt-28">
                <h2
                  id={section.id}
                  className="text-[22px] font-bold text-foreground mt-12 mb-4 scroll-mt-28 font-sans tracking-tight"
                >
                  {section.title}
                </h2>
                <div className="space-y-4 text-foreground/90">{section.content}</div>
              </section>
            ))}
          </main>
        </div>
      </div>
    </div>
  );
}
