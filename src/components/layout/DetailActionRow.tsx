'use client';

import React from "react";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { cn } from "@/lib/utils";

export interface DetailAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  variant?: "outline" | "danger";
  disabled?: boolean;
}

export interface PhonePrimaryAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  title?: string;
}

interface DetailActionRowProps {
  backHref: string;
  backLabel: string;
  actions: DetailAction[];
  phonePrimaryAction?: PhonePrimaryAction;
  className?: string;
}

export function DetailActionRow({
  backHref,
  backLabel,
  actions,
  phonePrimaryAction,
  className,
}: DetailActionRowProps) {
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

      {/* Mobile action group (< 640px) */}
      <div className="sm:hidden flex items-center gap-2 flex-shrink-0">
        {phonePrimaryAction && (
          <div className="relative group">
            <Button
              type="button"
              onClick={phonePrimaryAction.onClick}
              disabled={phonePrimaryAction.disabled}
              className="h-9 px-3 text-xs font-semibold bg-white text-neutral-950 hover:bg-neutral-200 flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
            >
              {phonePrimaryAction.icon}
              <span>{phonePrimaryAction.label}</span>
            </Button>
            {phonePrimaryAction.title && phonePrimaryAction.disabled && (
              <div
                role="tooltip"
                className="pointer-events-none absolute bottom-full right-0 mb-2 hidden group-hover:block z-50 whitespace-nowrap rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs font-medium text-neutral-200 shadow-xl"
              >
                {phonePrimaryAction.title}
              </div>
            )}
          </div>
        )}

        {actions.length > 0 && (
          <ActionMenu
            items={actions.map((action) => ({
              label: action.label,
              onClick: action.onClick,
              icon: action.icon,
              variant: action.variant === "danger" ? "danger" : "default",
              disabled: action.disabled,
            }))}
            label="More actions"
            triggerClassName="h-9 w-9 bg-neutral-900 border border-neutral-800"
          />
        )}
      </div>
    </div>
  );
}
