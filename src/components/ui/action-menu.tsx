'use client';

import React, { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActionMenuItem {
  label: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  variant?: "default" | "danger";
  disabled?: boolean;
  disabledTooltip?: string;
  separatorBefore?: boolean;
}

export interface ActionMenuProps {
  items: ActionMenuItem[];
  label?: string;
  triggerClassName?: string;
  contentClassName?: string;
}

export function ActionMenu({
  items,
  label = "Actions",
  triggerClassName,
  contentClassName,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <Tooltip.Provider delayDuration={200}>
      <DropdownMenu.Root open={open} onOpenChange={setOpen}>
        <Tooltip.Root open={open ? false : undefined}>
          <Tooltip.Trigger asChild>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className={cn(
                  "w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
                  triggerClassName
                )}
                aria-label={label}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenu.Trigger>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              side="top"
              align="center"
              sideOffset={4}
              className="hidden sm:block z-50 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-neutral-300 shadow-xl animate-in fade-in-0 zoom-in-95 pointer-events-none"
            >
              Actions
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            collisionPadding={8}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "z-50 min-w-[176px] rounded-xl border border-neutral-800 bg-neutral-950 p-1 shadow-2xl animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 duration-100",
              contentClassName
            )}
          >
            {items.map((item, index) => (
              <React.Fragment key={index}>
                {item.separatorBefore && (
                  <DropdownMenu.Separator className="my-1 border-t border-neutral-800" />
                )}
                {item.disabled ? (
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <span className="block w-full">
                        <DropdownMenu.Item
                          disabled
                          onSelect={(e) => e.preventDefault()}
                          className="w-full h-10 sm:h-9 px-3 text-left text-[13px] rounded-lg text-neutral-600 flex items-center select-none cursor-not-allowed opacity-60 focus:outline-none"
                        >
                          {item.icon && <span className="mr-2 shrink-0">{item.icon}</span>}
                          <span>{item.label}</span>
                        </DropdownMenu.Item>
                      </span>
                    </Tooltip.Trigger>
                    {item.disabledTooltip && (
                      <Tooltip.Portal>
                        <Tooltip.Content
                          side="left"
                          align="center"
                          sideOffset={6}
                          className="z-50 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs font-medium text-neutral-300 shadow-xl animate-in fade-in-0 zoom-in-95 pointer-events-none"
                        >
                          {item.disabledTooltip}
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    )}
                  </Tooltip.Root>
                ) : (
                  <DropdownMenu.Item
                    onSelect={(e) => {
                      e.stopPropagation();
                      item.onClick?.();
                    }}
                    className={cn(
                      "w-full h-10 sm:h-9 px-3 text-left text-[13px] rounded-lg flex items-center select-none cursor-pointer focus:outline-none transition-colors",
                      item.variant === "danger"
                        ? "text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 focus:text-rose-300 focus:bg-rose-950/40 data-[highlighted]:bg-rose-950/40 data-[highlighted]:text-rose-300"
                        : "text-neutral-300 hover:text-white hover:bg-neutral-900 focus:text-white focus:bg-neutral-900 data-[highlighted]:bg-neutral-900 data-[highlighted]:text-white"
                    )}
                  >
                    {item.icon && <span className="mr-2 shrink-0">{item.icon}</span>}
                    <span>{item.label}</span>
                  </DropdownMenu.Item>
                )}
              </React.Fragment>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </Tooltip.Provider>
  );
}
