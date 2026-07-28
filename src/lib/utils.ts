import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const numberFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "0";
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num)) return "0";
  return numberFormatter.format(num);
}

export function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "₦0";
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num)) return "₦0";
  return `₦${numberFormatter.format(num)}`;
}
