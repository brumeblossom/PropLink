import { RentFrequency } from "@prisma/client";

export function formatRentFrequency(freq: RentFrequency | string | null | undefined): string {
  if (!freq) return "month";
  const lower = freq.toLowerCase();
  if (lower === "weekly" || lower === "week") return "week";
  if (lower === "monthly" || lower === "month") return "month";
  if (lower === "quarterly" || lower === "quarter") return "quarter";
  if (lower === "annually" || lower === "yearly" || lower === "annual") return "year";
  return lower;
}

export const RENT_FREQUENCY_OPTIONS: { value: RentFrequency; label: string }[] = [
  { value: RentFrequency.weekly, label: "Weekly" },
  { value: RentFrequency.monthly, label: "Monthly" },
  { value: RentFrequency.quarterly, label: "Quarterly" },
  { value: RentFrequency.annually, label: "Yearly" },
];

export function rentFrequencyLabel(freq: RentFrequency | string | null | undefined): string {
  if (!freq) return "";
  const match = RENT_FREQUENCY_OPTIONS.find(
    (o) => o.value === freq || o.value.toLowerCase() === String(freq).toLowerCase()
  );
  if (match) return match.label;
  if (String(freq).toLowerCase() === "yearly" || String(freq).toLowerCase() === "annual") return "Yearly";
  return String(freq);
}
