"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  indeterminate?: boolean;
}

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, indeterminate, checked, ...props }, ref) => {
  const isIndeterminate = indeterminate || checked === "indeterminate";

  return (
    <CheckboxPrimitive.Root
      ref={ref}
      checked={isIndeterminate ? "indeterminate" : checked}
      className={cn(
        "peer h-4 w-4 shrink-0 rounded-[4px] border border-neutral-700 bg-neutral-900 transition-colors",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-950",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "data-[state=checked]:bg-white data-[state=checked]:text-neutral-950 data-[state=checked]:border-white",
        "data-[state=indeterminate]:bg-white data-[state=indeterminate]:text-neutral-950 data-[state=indeterminate]:border-white",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className={cn("flex items-center justify-center text-current")}
      >
        {isIndeterminate ? (
          <Minus className="h-3 w-3 stroke-[3]" />
        ) : (
          <Check className="h-3 w-3 stroke-[3]" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});

Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
