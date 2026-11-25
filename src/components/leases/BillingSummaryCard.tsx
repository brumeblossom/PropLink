'use client';

import React from "react";
import { formatCurrency, cn } from "@/lib/utils";
import { getDueDateStatus } from "@/lib/billing";

interface BillingSummaryData {
  rentDueToDate: number;
  paidToDate: number;
  outstanding: number;
  credit?: number;
  periodsDue: number;
  nextDueDate: string | Date | null;
  unpaidPeriods: number;
  pendingAmount?: number;
  isRentSet?: boolean;
}

interface BillingSummaryCardProps {
  viewer: "landlord" | "tenant";
  billingSummary: BillingSummaryData;
  leaseEndDate: Date | string;
  today?: Date;
  className?: string;
}

export function BillingSummaryCard({
  viewer,
  billingSummary,
  leaseEndDate,
  today = new Date(),
  className,
}: BillingSummaryCardProps) {
  const isRentSet = billingSummary.isRentSet !== false;

  const dueStatus = isRentSet
    ? getDueDateStatus(
        billingSummary.nextDueDate,
        leaseEndDate,
        today,
        billingSummary.unpaidPeriods
      )
    : null;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card/20 p-5 space-y-4",
        className
      )}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1">
          <span className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            RENT DUE TO DATE
          </span>
          <span className="text-[22px] font-semibold text-foreground block leading-tight">
            {!isRentSet ? "Rent not set" : formatCurrency(billingSummary.rentDueToDate)}
          </span>
          {isRentSet && (
            <span className="block text-xs text-muted-foreground">
              {billingSummary.periodsDue} {billingSummary.periodsDue === 1 ? "period" : "periods"} finished
            </span>
          )}
        </div>

        <div className="space-y-1">
          <span className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            PAID (CONFIRMED)
          </span>
          <span className="text-[22px] font-semibold text-foreground block leading-tight">
            {!isRentSet ? "Rent not set" : formatCurrency(billingSummary.paidToDate)}
          </span>
        </div>

        <div className="space-y-1">
          <span className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            OUTSTANDING
          </span>
          {!isRentSet ? (
            <span className="text-[22px] font-semibold text-muted-foreground block leading-tight">
              Rent not set
            </span>
          ) : (billingSummary.credit ?? 0) > 0 ? (
            <span className="text-[22px] font-semibold text-success block leading-tight">
              Credit {formatCurrency(billingSummary.credit!)}
            </span>
          ) : billingSummary.outstanding > 0 ? (
            <span className="text-[22px] font-semibold text-destructive block leading-tight">
              {formatCurrency(billingSummary.outstanding)}
            </span>
          ) : (
            <span className="text-[22px] font-semibold text-success block leading-tight">
              ₦0
            </span>
          )}
        </div>
      </div>

      {/* Overdue / Paid-to-end / Status line */}
      {isRentSet && dueStatus && (
        <div className="pt-3 border-t border-border/60 text-xs sm:text-sm text-foreground/80">
          <span
            className={cn(
              dueStatus.status === "overdue"
                ? "text-destructive font-medium"
                : dueStatus.status === "today"
                ? "text-warning font-medium"
                : dueStatus.status === "paid_in_full"
                ? "text-success font-medium"
                : "text-muted-foreground"
            )}
          >
            {dueStatus.text}
          </span>
          {viewer === "tenant" && (billingSummary.pendingAmount ?? 0) > 0 && (
            <span className="text-warning font-medium ml-1">
              • {formatCurrency(billingSummary.pendingAmount!)} waiting for landlord confirmation
            </span>
          )}
          {viewer === "landlord" && (billingSummary.pendingAmount ?? 0) > 0 && (
            <span className="text-warning font-medium ml-1">
              • {formatCurrency(billingSummary.pendingAmount!)} pending your confirmation
            </span>
          )}
        </div>
      )}
    </div>
  );
}
