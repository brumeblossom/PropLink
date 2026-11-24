import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface BackButtonProps {
  href?: string;
  onClick?: () => void;
  label?: string;
  className?: string;
}

export function BackButton({ href, onClick, label = "Back", className }: BackButtonProps) {
  const content = (
    <>
      <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
      {label && <span className="text-sm font-medium">{label}</span>}
    </>
  );

  const classes = cn(
    "h-9 inline-flex items-center space-x-2 text-muted-foreground hover:text-foreground transition-colors group focus:outline-none",
    className
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    );
  }

  return (
    <Link href={href || "#"} className={classes}>
      {content}
    </Link>
  );
}
