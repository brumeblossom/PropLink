import Link from "next/link";
import { ArrowLeft } from "lucide-react";

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

  const classes = `h-9 inline-flex items-center space-x-2 text-neutral-400 hover:text-white transition-colors group focus:outline-none ${className || ""}`;

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
