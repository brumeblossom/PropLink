import React from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  className?: string;
}

export function PageContainer({ children, className, ...props }: PageContainerProps) {
  return (
    <main className={cn("max-w-3xl mx-auto px-6 py-10 space-y-8", className)} {...props}>
      {children}
    </main>
  );
}
