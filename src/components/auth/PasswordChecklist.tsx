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
    { label: "One uppercase letter (A–Z)", valid: /[A-Z]/.test(password) },
    { label: "One lowercase letter (a–z)", valid: /[a-z]/.test(password) },
    { label: "One number (0–9)", valid: /[0-9]/.test(password) },
  ];

  return (
    <div className={cn("space-y-1.5 pt-1", className)}>
      {rules.map((rule) => (
        <div key={rule.label} className="flex items-center space-x-2 text-xs">
          {rule.valid ? (
            <Check className="w-3.5 h-3.5 text-success flex-shrink-0" />
          ) : (
            <Circle className="w-3.5 h-3.5 text-subtle-foreground flex-shrink-0" />
          )}
          <span
            className={cn(
              "transition-colors",
              rule.valid ? "text-foreground/80" : "text-muted-foreground"
            )}
          >
            {rule.label}
          </span>
        </div>
      ))}
    </div>
  );
}
