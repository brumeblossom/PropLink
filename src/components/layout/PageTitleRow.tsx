import React from "react";
import { cn } from "@/lib/utils";

export interface PageTitleRowProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageTitleRow({
  title,
  description,
  actions,
  className,
}: PageTitleRowProps) {
  return (
    <div className={cn("w-full space-y-2", className)}>
      {/* Row 1: Heading on left, actions on right */}
      <div className="flex items-center justify-between gap-4">
        {typeof title === "string" ? (
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            {title}
          </h1>
        ) : (
          title
        )}
        {actions && (
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>

      {/* Row 2: Full width description under heading */}
      {description && (
        <p className="text-neutral-400 text-sm">
          {description}
        </p>
      )}
    </div>
  );
}
