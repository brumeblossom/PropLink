'use client';

import React from "react";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { formatDateGB } from "@/lib/billing";
import { formatRentFrequency } from "@/lib/rent";

interface LeaseDetailsCardProps {
  viewer: "landlord" | "tenant";
  startDate: Date | string;
  endDate: Date | string;
  rentAmount: number | string;
  rentFrequency: string;
  depositAmount?: number | string | null;
  unitType?: string | null;
  onEditLease?: () => void;
  className?: string;
}

function formatUnitType(type: string): string {
  return type
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function LeaseDetailsCard({
  viewer,
  startDate,
  endDate,
  rentAmount,
  rentFrequency,
  depositAmount,
  unitType,
  onEditLease,
  className,
}: LeaseDetailsCardProps) {
  const numericRent = Number(rentAmount) || 0;
  const numericDeposit = depositAmount != null && depositAmount !== "" ? Number(depositAmount) : null;
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card/20 p-5 space-y-4 h-full flex flex-col justify-between",
        className
      )}
    >
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-foreground text-lg">Lease</h3>
            <p className="text-muted-foreground text-xs mt-0.5">
              Tenancy terms and duration.
            </p>
          </div>
          {viewer === "landlord" && onEditLease && (
            <Button
              variant="outline"
              size="action"
              onClick={onEditLease}
              className="gap-1.5"
            >
              <Pencil className="w-4 h-4" />
              Edit lease
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 text-xs">
          <div>
            <span className="text-muted-foreground block uppercase tracking-wider text-[10px] font-bold">
              Period
            </span>
            <span className="text-foreground font-medium block mt-1">
              {formatDateGB(startDate)} – {formatDateGB(endDate)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block uppercase tracking-wider text-[10px] font-bold">
              Rent
            </span>
            <span className="text-foreground font-semibold block mt-1">
              {formatCurrency(numericRent)} / {formatRentFrequency(rentFrequency)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block uppercase tracking-wider text-[10px] font-bold">
              Deposit
            </span>
            <span className="text-foreground font-medium block mt-1">
              {numericDeposit != null ? formatCurrency(numericDeposit) : "—"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block uppercase tracking-wider text-[10px] font-bold">
              Unit type
            </span>
            <span className="text-foreground font-medium block mt-1">
              {unitType ? formatUnitType(unitType) : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
