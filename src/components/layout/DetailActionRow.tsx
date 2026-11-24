'use client';

import React from "react";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface DetailAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  variant?: "outline" | "danger" | "primary";
  disabled?: boolean;
  disabledTooltip?: string;
}

export interface PhonePrimaryAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  title?: string;
  disabledTooltip?: string;
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
        {actions.map((action, i) => {
          const buttonElement = (
            <Button
              type="button"
              variant={action.variant === "primary" ? "default" : "outline"}
              onClick={action.onClick}
              disabled={action.disabled}
              className={cn(
                "h-9 px-3.5 text-xs font-medium flex items-center transition-colors disabled:opacity-50",
                action.disabled && "pointer-events-none",
                action.variant === "danger"
                  ? "border-rose-900/50 text-rose-400 hover:bg-rose-950/30 hover:text-rose-300 hover:border-rose-800"
                  : action.variant === "primary"
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                  : "border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-850"
              )}
            >
              {action.icon && <span className="mr-1.5 flex-shrink-0">{action.icon}</span>}
              <span>{action.label}</span>
            </Button>
          );

          if (action.disabled && action.disabledTooltip) {
            return (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <span className="inline-flex cursor-not-allowed">
                    {buttonElement}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" align="center">
                  {action.disabledTooltip}
                </TooltipContent>
              </Tooltip>
            );
          }

          return <div key={i}>{buttonElement}</div>;
        })}
      </div>

      {/* Mobile action group (< 640px) */}
      <div className="sm:hidden flex items-center gap-2 flex-shrink-0">
        {phonePrimaryAction && (
          phonePrimaryAction.disabled && (phonePrimaryAction.title || phonePrimaryAction.disabledTooltip) ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-not-allowed">
                  <Button
                    type="button"
                    onClick={phonePrimaryAction.onClick}
                    disabled={phonePrimaryAction.disabled}
                    className="h-9 px-3 text-xs font-semibold bg-white text-neutral-950 hover:bg-neutral-200 flex items-center gap-1.5 disabled:opacity-50 pointer-events-none"
                  >
                    {phonePrimaryAction.icon}
                    <span>{phonePrimaryAction.label}</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" align="end">
                {phonePrimaryAction.title || phonePrimaryAction.disabledTooltip}
              </TooltipContent>
            </Tooltip>
          ) : (
            <div>
              <Button
                type="button"
                onClick={phonePrimaryAction.onClick}
                disabled={phonePrimaryAction.disabled}
                className="h-9 px-3 text-xs font-semibold bg-white text-neutral-950 hover:bg-neutral-200 flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
              >
                {phonePrimaryAction.icon}
                <span>{phonePrimaryAction.label}</span>
              </Button>
            </div>
          )
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
