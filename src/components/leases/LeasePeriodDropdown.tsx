'use client';

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { formatDateGB } from "@/lib/billing";
import { cn } from "@/lib/utils";

export interface LeaseOption {
  id: string;
  startDate: string | Date;
  endDate?: string | Date | null;
  tenantName?: string | null;
  status: "current" | "ended" | "moved_out" | "upcoming";
}

interface LeasePeriodDropdownProps {
  leases: LeaseOption[];
  selectedLeaseId: string;
  onSelectLease: (leaseId: string) => void;
  isLandlord?: boolean;
  totalLeasesCount?: number;
  totalTenantsCount?: number;
}

export function LeasePeriodDropdown({
  leases,
  selectedLeaseId,
  onSelectLease,
  isLandlord = false,
  totalLeasesCount,
  totalTenantsCount,
}: LeasePeriodDropdownProps) {
  const selectedLease = leases.find((l) => l.id === selectedLeaseId) || leases[0];

  const getStatusBadge = (status: LeaseOption["status"]) => {
    switch (status) {
      case "current":
        return (
          <span className="shrink-0 inline-flex items-center px-2.5 h-[22px] rounded-full text-xs font-semibold bg-success-tint text-success">
            Current
          </span>
        );
      case "ended":
        return (
          <span className="shrink-0 inline-flex items-center px-2.5 h-[22px] rounded-full text-xs font-semibold bg-destructive-tint text-destructive">
            Ended
          </span>
        );
      case "moved_out":
        return (
          <span className="shrink-0 inline-flex items-center px-2.5 h-[22px] rounded-full text-xs font-semibold bg-muted text-muted-foreground">
            Moved out
          </span>
        );
      case "upcoming":
        return (
          <span className="shrink-0 inline-flex items-center px-2.5 h-[22px] rounded-full text-xs font-semibold bg-warning-tint text-warning">
            Upcoming
          </span>
        );
      default:
        return null;
    }
  };

  const formatOptionLabel = (lease: LeaseOption) => {
    const range = `${formatDateGB(lease.startDate)} – ${lease.endDate ? formatDateGB(lease.endDate) : "Ongoing"}`;
    if (isLandlord && lease.tenantName) {
      return `${range} · ${lease.tenantName}`;
    }
    return range;
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg bg-card border border-border hover:bg-accent text-sm text-foreground transition-colors w-full sm:w-auto min-w-[220px] focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label="Select lease period"
        >
          <div className="flex items-center gap-2 min-w-0 truncate">
            {selectedLease && (
              <>
                <span className="font-medium text-foreground truncate">
                  {formatOptionLabel(selectedLease)}
                </span>
                {getStatusBadge(selectedLease.status)}
              </>
            )}
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-[280px] max-w-[92vw] sm:max-w-md rounded-xl border border-border bg-card p-1.5 shadow-xl text-foreground text-sm focus:outline-none animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          {isLandlord && (
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border mb-1">
              {totalLeasesCount ?? leases.length} leases · {totalTenantsCount ?? new Set(leases.map((l) => l.tenantName).filter(Boolean)).size} tenants
            </div>
          )}

          <div className="max-h-[300px] overflow-y-auto space-y-0.5">
            {leases.map((lease) => {
              const isSelected = lease.id === selectedLeaseId;
              return (
                <DropdownMenu.Item
                  key={lease.id}
                  onSelect={() => onSelectLease(lease.id)}
                  className={cn(
                    "flex items-center justify-between gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors outline-none",
                    isSelected
                      ? "bg-muted text-foreground font-medium"
                      : "hover:bg-muted/60 text-foreground/80 hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                      {isSelected && <Check className="w-4 h-4 text-success" />}
                    </div>
                    <span className="truncate">{formatOptionLabel(lease)}</span>
                  </div>
                  {getStatusBadge(lease.status)}
                </DropdownMenu.Item>
              );
            })}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
