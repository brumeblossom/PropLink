import React from "react";
import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { isPasswordValid } from "@/lib/password";

export { isPasswordValid };

export function PasswordChecklist({
  password,
  className,
}: {
  password: string;
  className?: string;
}) {
  const rules = [
    { label: "At least 8 characters", valid: password.length >= 8 },
    { label: "One uppercase letter", valid: /[A-Z]/.test(password) },
    { label: "One lowercase letter", valid: /[a-z]/.test(password) },
    { label: "One special character", valid: /[^A-Za-z0-9]/.test(password) },
  ];

  const passedCount = rules.filter((r) => r.valid).length;

  const getSegmentColor = (index: number) => {
    if (index >= passedCount) return "bg-muted";
    if (passedCount === 1) return "bg-destructive";
    if (passedCount === 2 || passedCount === 3) return "bg-warning";
    return "bg-success";
  };

  return (
    <div className={cn("w-full pt-1", className)}>
      {/* 4-segment strength bar */}
      <div className="flex items-center gap-1.5 w-full">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn("h-1 flex-1 rounded-full transition-colors duration-200", getSegmentColor(i))}
          />
        ))}
      </div>

      {/* 2x2 grid of rules */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3">
        {rules.map((rule) => (
          <div key={rule.label} className="flex items-center gap-2 text-xs">
            {rule.valid ? (
              <span className="w-3.5 h-3.5 rounded-full bg-success/20 flex items-center justify-center shrink-0">
                <Check className="w-2.5 h-2.5 text-success stroke-[3]" />
              </span>
            ) : (
              <Circle className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
            )}
            <span
              className={cn(
                "transition-colors",
                rule.valid ? "text-success font-medium" : "text-muted-foreground"
              )}
            >
              {rule.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
