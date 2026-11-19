'use client';

import React from "react";
import { Menu } from "lucide-react";
import { useSidebar } from "./SidebarContext";
import { NotificationBell } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, className }: PageHeaderProps) {
  const { open: openSidebar } = useSidebar();

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

      {/* Right side: Notification Bell at the far right */}
      <div className="flex items-center flex-shrink-0">
        <NotificationBell />
      </div>
    </header>
  );
}
