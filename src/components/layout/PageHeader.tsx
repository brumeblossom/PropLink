'use client';

import React, { useState } from "react";
import { Menu, MoreHorizontal } from "lucide-react";
import { useSidebar } from "./SidebarContext";
import { NotificationBell } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, actions, className }: PageHeaderProps) {
  const { open: openSidebar } = useSidebar();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header
      className={cn(
        "h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-30",
        className
      )}
    >
      {/* Left side: Mobile menu button + Title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={openSidebar}
          className="md:hidden p-1.5 -ml-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-900 transition-colors focus:outline-none"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="truncate">
          {typeof title === "string" ? (
            <h1 className="text-lg md:text-xl font-bold tracking-tight text-white truncate">
              {title}
            </h1>
          ) : (
            title
          )}
        </div>
      </div>

      {/* Right side: Desktop Actions + Mobile Menu + Notification Bell */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {actions && (
          <>
            {/* Desktop: Action buttons rendered directly */}
            <div className="hidden md:flex items-center gap-3">
              {actions}
            </div>

            {/* Mobile: ⋯ button toggling actions menu */}
            <div className="relative md:hidden">
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-900 transition-colors focus:outline-none"
                aria-label="More actions"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>

              {isMobileMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsMobileMenuOpen(false)}
                    aria-hidden="true"
                  />
                  <div
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="absolute right-0 top-full mt-2 z-50 min-w-[180px] rounded-xl border border-neutral-800 bg-neutral-950 p-2 shadow-2xl flex flex-col gap-2 animate-in fade-in-0 zoom-in-95 duration-100"
                  >
                    {actions}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Notification Bell at the far right */}
        <NotificationBell />
      </div>
    </header>
  );
}
