import React from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  className?: string;
  width?: "wide" | "narrow";
}

export function PageContainer({
  children,
  className,
  width = "wide",
  ...props
}: PageContainerProps) {
  return (
    <main
      className={cn(
        "mx-auto",
        width === "narrow"
          ? "max-w-3xl px-6 py-10 space-y-8"
          : "max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6",
        className
      )}
      {...props}
    >
      {children}
    </main>
  );
}
