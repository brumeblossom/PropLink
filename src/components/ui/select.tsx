import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  wrapperClassName?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, wrapperClassName, children, ...props }, ref) => {
    return (
      <div className={cn("relative inline-block w-full", wrapperClassName)}>
        <select
          ref={ref}
          className={cn(
            "appearance-none w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 pr-9 py-2 text-sm text-neutral-200 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400"
          aria-hidden="true"
        />
      </div>
    );
  }
);
Select.displayName = "Select";
