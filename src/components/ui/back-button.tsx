import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface BackButtonProps {
  href: string;
  label?: string;
  className?: string;
}

export function BackButton({ href, label = "Back", className }: BackButtonProps) {
  return (
    <Link
      href={href}
      className={`h-9 inline-flex items-center space-x-2 text-neutral-400 hover:text-white transition-colors group focus:outline-none ${className || ""}`}
    >
      <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}
