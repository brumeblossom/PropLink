'use client';

import React from "react";
import { cn } from "@/lib/utils";

interface UnitHeaderCardProps {
  viewer: "landlord" | "tenant";
  unitNumber: string;
  propertyName: string;
  propertyAddress?: string | null;
  status: string;
  person?: {
    fullName: string;
    email: string;
  } | null;
  inviteStatus?: "invited" | "expired" | "joined" | null;
  className?: string;
}

export function UnitHeaderCard({
  viewer,
  unitNumber,
  propertyName,
  propertyAddress,
  status,
  person,
  inviteStatus,
  className,
}: UnitHeaderCardProps) {
  const renderStatusPill = () => {
    const s = status.toLowerCase();
    if (viewer === "tenant") {
      switch (s) {
        case "active":
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-tint border border-success/20 text-success">
              Active
            </span>
          );
        case "upcoming":
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-tint border border-primary/20 text-primary">
              Upcoming
            </span>
          );
        case "moved_out":
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted border border-border text-muted-foreground">
              Moved out
            </span>
          );
        case "ended":
        default:
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted border border-border text-muted-foreground">
              Ended
            </span>
          );
      }
    } else {
      // Landlord view: Occupied / Vacant / Ended / Reserved
      switch (s) {
        case "occupied":
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-tint border border-success/20 text-success">
              Occupied
            </span>
          );
        case "vacant":
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning-tint border border-warning/20 text-warning">
              Vacant
            </span>
          );
        case "reserved":
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-tint border border-primary/20 text-primary">
              Reserved
            </span>
          );
        case "moved_out":
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted border border-border text-muted-foreground">
              Moved out
            </span>
          );
        case "ended":
        default:
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted border border-border text-muted-foreground">
              Ended
            </span>
          );
      }
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card/40 p-6 backdrop-blur-sm",
        className
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground font-sans">
              Unit {unitNumber}
            </h1>
            {renderStatusPill()}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {propertyName}
            {propertyAddress ? ` · ${propertyAddress}` : ""}
          </p>
        </div>

        <div className="sm:text-right shrink-0">
          <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            {viewer === "landlord" ? "TENANT" : "LANDLORD"}
          </span>
          {person ? (
            <>
              <div className="flex items-center sm:justify-end gap-2 mt-0.5">
                <span className="text-sm font-semibold text-foreground">
                  {person.fullName}
                </span>
                {viewer === "landlord" && inviteStatus && inviteStatus !== "joined" && (
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
                      inviteStatus === "expired"
                        ? "bg-destructive-tint text-destructive border-destructive/20"
                        : "bg-warning-tint text-warning border-warning/20"
                    )}
                  >
                    {inviteStatus === "expired" ? "Expired" : "Invited"}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground block mt-0.5">
                {person.email}
              </span>
            </>
          ) : (
            <p className="text-sm text-muted-foreground italic mt-0.5">
              Vacant, no active tenant
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
