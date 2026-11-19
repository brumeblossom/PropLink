'use client';

import React, { useState } from "react";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DetailAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  variant?: "outline" | "danger";
  disabled?: boolean;
}

interface DetailActionRowProps {
  backHref: string;
  backLabel: string;
  actions: DetailAction[];
  className?: string;
}

export function DetailActionRow({
  backHref,
  backLabel,
  actions,
  className,
}: DetailActionRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 w-full",
        className
      )}
    >
      {/* Back link */}
      <div className="flex-shrink-0">
        <BackButton href={backHref} label={backLabel} />
      </div>

      {/* Desktop actions (>= 640px) */}
      <div className="hidden sm:flex items-center space-x-2 flex-shrink-0">
        {actions.map((action, i) => (
          <Button
            key={i}
            type="button"
            variant="outline"
            onClick={action.onClick}
            disabled={action.disabled}
            className={cn(
              "h-9 px-3.5 text-xs font-medium flex items-center transition-colors",
              action.variant === "danger"
                ? "border-rose-900/50 text-rose-400 hover:bg-rose-950/30 hover:text-rose-300 hover:border-rose-800"
                : "border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-850"
            )}
          >
            {action.icon && <span className="mr-1.5 flex-shrink-0">{action.icon}</span>}
            <span>{action.label}</span>
          </Button>
        ))}
      </div>

      {/* Mobile ⋯ dropdown (< 640px) */}
      <div className="sm:hidden relative flex-shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-850 transition-colors"
          aria-label="More actions"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 mt-1.5 w-44 rounded-xl border border-neutral-800 bg-neutral-950 p-1 shadow-2xl z-50 animate-in fade-in-0 zoom-in-95 duration-100">
              {actions.map((action, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    action.onClick();
                  }}
                  disabled={action.disabled}
                  className={cn(
                    "w-full px-3 py-2 text-left text-xs rounded-lg flex items-center space-x-2 transition-colors",
                    action.variant === "danger"
                      ? "text-rose-400 hover:bg-rose-950/40 hover:text-rose-300"
                      : "text-neutral-300 hover:bg-neutral-900 hover:text-white"
                  )}
                >
                  {action.icon && <span className="flex-shrink-0">{action.icon}</span>}
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
