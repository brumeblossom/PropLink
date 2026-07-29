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

export function formatInputNumber(value: string): string {
  // Remove non-digit and non-decimal-point characters
  const clean = value.replace(/[^0-9.]/g, "");
  // Prevent multiple decimal points
  const parts = clean.split(".");
  if (parts.length > 2) {
    parts.splice(2);
  }
  // Format the integer part with commas-per-thousand
  const integerPart = parts[0];
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  
  if (parts.length === 2) {
    return `${formattedInteger}.${parts[1]}`;
  }
  return formattedInteger;
}
