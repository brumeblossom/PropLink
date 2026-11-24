'use client';

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/utils/trpc";
import * as Dialog from "@radix-ui/react-dialog";
import { 
  Users, 
  Search, 
  Mail, 
  Phone, 
  X,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalField } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, cn } from "@/lib/utils";
import { formatDateGB, formatTwoLineRentDue, type RentDueLines } from "@/lib/billing";

interface ProcessedLease {
  id: string;
  unitId: string;
  unitName: string;
  propertyId: string;
  propertyName: string;
  startDate: string;
  endDate: string;
  rentAmount: number;
  rentFrequency: string;
  leaseStatus: "active" | "ended" | "moved_out" | "upcoming" | "pending" | "invite_sent" | "invite_expired";
  nextDueDate: string | null;
  unpaidPeriods: number;
  nextDueStatus: "overdue" | "today" | "upcoming" | "paid_in_full" | "pending";
  nextDueText: string;
  totalLeaseRent?: number;
  totalPaid?: number;
  outstanding?: number;
  renewal?: {
    id: string;
    startDate: string;
    endDate: string;
    rentAmount: number;
    rentFrequency: string;
  } | null;
  inviteCode?: string | null;
  inviteExpiresAt?: string | null;
  isCodeInvite?: boolean;
  hasPayments?: boolean;
}

interface UnitLeaseGroup {
  unitId: string;
  unitName: string;
  propertyId: string;
  propertyName: string;
  currentLease: ProcessedLease;
  allLeases: ProcessedLease[];
}

interface TenantRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  leases: ProcessedLease[];
  units?: UnitLeaseGroup[];
  unitDisplay: {
    primaryUnit: string;
    moreCount: number;
  };
  propertyDisplay: string;
  overallStatus: "ended" | "moved_out" | "active" | "upcoming" | "pending" | "invite_sent" | "invite_expired";
  isCurrent: boolean;
  nextRentDue: {
    type: "overdue" | "today" | "upcoming" | "paid_in_full" | "expired" | "pending";
    dueDate: string | null;
    unpaidPeriods: number;
    leaseStartDate: string | null;
    isUpcomingLease: boolean;
  };
}

function LeaseStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "invite_sent":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning-tint text-warning border border-warning/20">
          Invite sent
        </span>
      );
    case "invite_expired":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-destructive-tint text-destructive border border-destructive/20">
          Invite expired
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning-tint text-warning border border-warning/20">
          Pending
        </span>
      );
    case "ended":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
          Ended
        </span>
      );
    case "moved_out":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
          Moved out
        </span>
      );
    case "active":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success-tint text-success border border-success/20">
          Active
        </span>
      );
    case "upcoming":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-tint text-primary border border-primary/20">
          Upcoming
        </span>
      );
    case "terminated":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
          Moved out
        </span>
      );
    default:
      return null;
  }
}

function TwoLineRentDue({ data }: { data: RentDueLines }) {
  if (data.status === "expired") {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  if (data.status === "paid_in_full") {
    return (
      <span className="text-success font-medium text-sm block truncate" title={data.line1}>
        {data.line1}
      </span>
    );
  }
  if (data.status === "overdue") {
    return (
      <div className="leading-tight">
        <div className="text-destructive font-medium text-sm truncate" title={data.line1}>
          {data.line1}
        </div>
        {data.line2 && (
          <div className="text-muted-foreground text-xs mt-0.5 truncate" title={data.line2}>
            {data.line2}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="leading-tight">
      <div className="text-foreground font-medium text-sm truncate" title={data.line1}>
        {data.line1}
      </div>
      {data.line2 && (
        <div className="text-muted-foreground text-xs mt-0.5 truncate" title={data.line2}>
          {data.line2}
        </div>
      )}
    </div>
  );
}

function LandlordTenantsContent() {
  const searchParams = useSearchParams();
  const initialPropertyId = searchParams.get("propertyId") || "";
  const initialStatus = (searchParams.get("status") as "all" | "active" | "past") || "all";

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [propertyId, setPropertyId] = useState(initialPropertyId);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "past">(initialStatus);
  const [leaseStatusFilter, setLeaseStatusFilter] = useState<"" | "active" | "ended" | "moved_out">("");
  const [page, setPage] = useState(1);
  const [selectedTenant, setSelectedTenant] = useState<TenantRow | null>(null);

  const utils = trpc.useUtils();
  const { toast } = useToast();

  const [leaseToEditTenant, setLeaseToEditTenant] = useState<{ id: string; fullName: string; email: string } | null>(null);
  const [editTenantFullName, setEditTenantFullName] = useState("");
  const [editTenantEmail, setEditTenantEmail] = useState("");
  const [editTenantError, setEditTenantError] = useState<string | null>(null);

  const [leaseToCancelCode, setLeaseToCancelCode] = useState<{ id: string; unitName: string; tenantName: string } | null>(null);
  const [leaseToCancelInApp, setLeaseToCancelInApp] = useState<{ id: string; unitName: string } | null>(null);

  const updatePlaceholderTenantMutation = trpc.leases.updatePlaceholderTenant.useMutation({
    onSuccess: () => {
      toast("Tenant details updated", "success");
      setLeaseToEditTenant(null);
      utils.leases.getLandlordTenants.invalidate();
    },
    onError: (err) => {
      setEditTenantError(err.message);
    },
  });

  const cancelCodeInviteMutation = trpc.leases.cancelCodeInvite.useMutation({
    onSuccess: () => {
      toast("Invite cancelled", "success");
      setLeaseToCancelCode(null);
      setSelectedTenant(null);
      utils.leases.getLandlordTenants.invalidate();
      utils.properties.list.invalidate();
      utils.dashboard.landlordSummary.invalidate();
    },
    onError: (err) => {
      toast(err.message, "error");
    },
  });

  const cancelInvitationMutation = trpc.leases.cancelInvitation.useMutation({
    onSuccess: () => {
      toast("Invitation cancelled", "success");
      setLeaseToCancelInApp(null);
      setSelectedTenant(null);
      utils.leases.getLandlordTenants.invalidate();
      utils.properties.list.invalidate();
      utils.dashboard.landlordSummary.invalidate();
    },
    onError: (err) => {
      toast(err.message, "error");
    },
  });

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: properties } = trpc.properties.list.useQuery();

  const { data, isLoading } = trpc.leases.getLandlordTenants.useQuery({
    search: debouncedSearch || undefined,
    propertyId: propertyId || undefined,
    status: statusFilter,
    leaseStatus: leaseStatusFilter || undefined,
    page,
    pageSize: 25,
  });

  const total = data?.total ?? 0;
  const tenants = data?.rows ?? [];
  const pageSize = 25;
  const fromRecord = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toRecord = Math.min(page * pageSize, total);
  const totalPages = Math.ceil(total / pageSize);

  const hasActiveFilters = Boolean(
    searchInput.trim() || propertyId || statusFilter !== "all" || leaseStatusFilter
  );

  const clearFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setPropertyId("");
    setStatusFilter("all");
    setLeaseStatusFilter("");
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageHeader title="Tenant List" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Title row: Heading "Your tenants" with count as small muted pill ("7"), 32px gap under */}
        <div className="flex items-center gap-2.5 mb-8">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Your tenants</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
            {total}
          </span>
        </div>

        {/* Toolbar: directly under heading, no box or border, same style as units table toolbar */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6">
          {/* Search Input: full width on mobile, 280px on desktop */}
          <div className="relative w-full md:w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, email or phone"
              className="w-full pl-9 pr-8 py-2 rounded-lg bg-card border border-input text-sm text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filters: two per row on mobile, inline on desktop */}
          <div className="grid grid-cols-2 md:flex md:items-center gap-2.5 flex-1">
            {/* Property Filter */}
            <div className="col-span-1 md:w-48">
              <Select
                value={propertyId}
                onChange={(e) => {
                  setPropertyId(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by property"
              >
                <option value="">All properties</option>
                {properties?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>

            {/* Active / Past Filter */}
            <div className="col-span-1 md:w-36">
              <Select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as "all" | "active" | "past");
                  setPage(1);
                }}
                aria-label="Filter by tenant status"
              >
                <option value="all">All tenants</option>
                <option value="active">Active tenants</option>
                <option value="past">Past tenants</option>
              </Select>
            </div>

            {/* Lease Status Filter */}
            <div className="col-span-2 sm:col-span-1 md:w-40">
              <Select
                value={leaseStatusFilter}
                onChange={(e) => {
                  setLeaseStatusFilter(e.target.value as "" | "active" | "ended" | "moved_out");
                  setPage(1);
                }}
                aria-label="Filter by lease status"
              >
                <option value="">All lease statuses</option>
                <option value="active">Active</option>
                <option value="ended">Ended</option>
                <option value="moved_out">Moved out</option>
              </Select>
            </div>
          </div>
        </div>

        {/* Content Section */}
        {isLoading ? (
          <div className="rounded-xl border border-border bg-card/30 p-6 space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                <div className="space-y-1">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : total === 0 ? (
          /* Empty States */
          <div className="rounded-xl border border-border bg-card/20 py-16 px-4 text-center">
            {hasActiveFilters ? (
              <div className="max-w-md mx-auto space-y-3">
                <Search className="w-10 h-10 text-muted-foreground mx-auto" />
                <h3 className="text-base font-semibold text-foreground">No tenants match these filters.</h3>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your search query, property, or lease status filters.
                </p>
                <div className="pt-2">
                  <Button
                    onClick={clearFilters}
                    className="bg-card border border-border hover:bg-accent text-foreground text-sm h-9 px-4 rounded-lg font-medium"
                  >
                    Clear filters
                  </Button>
                </div>
              </div>
            ) : (
              <div className="max-w-md mx-auto space-y-3">
                <Users className="w-10 h-10 text-muted-foreground mx-auto" />
                <h3 className="text-base font-semibold text-foreground">No tenants yet.</h3>
                <p className="text-sm text-muted-foreground">
                  Invite a tenant from a vacant unit to start tracking leases and payments.
                </p>
                <div className="pt-2">
                  <Link href="/landlord/properties">
                    <Button className="bg-primary hover:bg-primary/90 text-primary-foreground text-sm h-9 px-4 rounded-lg font-semibold">
                      View Properties
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Desktop Table: table-layout: fixed, set column widths, no sideways scroll at 1024px+ */}
            <div className="hidden md:block rounded-xl border border-border bg-card/40 overflow-hidden">
              <table className="w-full table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[28%] xl:w-[24%]" />
                  <col className="hidden xl:table-column xl:w-[13%]" />
                  <col className="w-[15%] xl:w-[13%]" />
                  <col className="w-[21%] xl:w-[18%]" />
                  <col className="w-[15%] xl:w-[13%]" />
                  <col className="w-[21%] xl:w-[19%]" />
                </colgroup>
                <thead className="border-b border-border bg-muted/70 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">Tenant</th>
                    <th scope="col" className="hidden xl:table-cell px-5 py-3.5">Phone</th>
                    <th scope="col" className="px-5 py-3.5">Unit(s)</th>
                    <th scope="col" className="px-5 py-3.5">Property</th>
                    <th scope="col" className="px-5 py-3.5">Lease status</th>
                    <th scope="col" className="px-5 py-3.5">Next rent due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {tenants.map((tenant) => {
                    const isSelected = selectedTenant?.id === tenant.id;
                    const rentDueLines = formatTwoLineRentDue({
                      leaseStatus: tenant.overallStatus,
                      nextDueDate: tenant.nextRentDue.dueDate,
                      unpaidPeriods: tenant.nextRentDue.unpaidPeriods,
                      startDate: tenant.nextRentDue.leaseStartDate,
                    });

                    return (
                      <tr
                        key={tenant.id}
                        onClick={() => setSelectedTenant(isSelected ? null : tenant)}
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-accent/50",
                          isSelected && "bg-accent"
                        )}
                      >
                        {/* Tenant: Name + Email (truncated) */}
                        <td className="px-5 py-4">
                          <div className="font-semibold text-foreground truncate" title={tenant.fullName}>
                            {tenant.fullName}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 truncate" title={tenant.email}>
                            {tenant.email}
                          </div>
                        </td>

                        {/* Phone: hidden 768-1279px, shows xl */}
                        <td className="hidden xl:table-cell px-5 py-4 text-muted-foreground">
                          <div className="truncate" title={tenant.phone || undefined}>
                            {tenant.phone || "—"}
                          </div>
                        </td>

                        {/* Unit(s) */}
                        <td className="px-5 py-4">
                          <div className="flex items-center min-w-0">
                            <span className="font-medium text-foreground truncate" title={tenant.unitDisplay.primaryUnit}>
                              {tenant.unitDisplay.primaryUnit}
                            </span>
                            {tenant.unitDisplay.moreCount > 0 && (
                              <span className="shrink-0 ml-1.5 px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground border border-border">
                                +{tenant.unitDisplay.moreCount} more
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Property */}
                        <td className="px-5 py-4 text-muted-foreground">
                          <div className="truncate" title={tenant.propertyDisplay}>
                            {tenant.propertyDisplay}
                          </div>
                        </td>

                        {/* Lease Status */}
                        <td className="px-5 py-4">
                          <LeaseStatusBadge status={tenant.overallStatus} />
                        </td>

                        {/* Next Rent Due: Two short lines, column title not repeated */}
                        <td className="px-5 py-4">
                          <TwoLineRentDue data={rentDueLines} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards (< 768px): one card per tenant */}
            <div className="md:hidden space-y-3">
              {tenants.map((tenant) => {
                const rentDueLines = formatTwoLineRentDue({
                  leaseStatus: tenant.overallStatus,
                  nextDueDate: tenant.nextRentDue.dueDate,
                  unpaidPeriods: tenant.nextRentDue.unpaidPeriods,
                  startDate: tenant.nextRentDue.leaseStartDate,
                });

                return (
                  <div
                    key={tenant.id}
                    onClick={() => setSelectedTenant(tenant)}
                    className="rounded-xl border border-border bg-card/40 p-4 space-y-3 cursor-pointer active:bg-accent hover:border-border transition-colors"
                  >
                    {/* Name, email, status pill top right */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <div className="font-semibold text-base text-foreground truncate" title={tenant.fullName}>
                          {tenant.fullName}
                        </div>
                        <div className="text-xs text-muted-foreground truncate" title={tenant.email}>
                          {tenant.email}
                        </div>
                      </div>
                      <div className="shrink-0">
                        <LeaseStatusBadge status={tenant.overallStatus} />
                      </div>
                    </div>

                    {/* Unit(s) · Property */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                      <span className="font-medium text-foreground shrink-0">
                        {tenant.unitDisplay.primaryUnit}
                      </span>
                      {tenant.unitDisplay.moreCount > 0 && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground border border-border">
                          +{tenant.unitDisplay.moreCount} more
                        </span>
                      )}
                      <span className="text-muted-foreground shrink-0">·</span>
                      <span className="text-muted-foreground truncate" title={tenant.propertyDisplay}>
                        {tenant.propertyDisplay}
                      </span>
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-border/60" />

                    {/* Next rent due label left with two-line value right */}
                    <div className="flex items-start justify-between gap-3 text-xs">
                      <span className="text-muted-foreground shrink-0 pt-0.5">Next rent due</span>
                      <div className="text-right">
                        <TwoLineRentDue data={rentDueLines} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border/80">
              <div className="text-sm text-muted-foreground">
                {total === 0 ? "0 of 0" : `${fromRecord}–${toRecord} of ${total}`}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="bg-card border border-border hover:bg-accent text-foreground text-sm h-8 px-3 rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>
                <Button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages}
                  className="bg-card border border-border hover:bg-accent text-foreground text-sm h-8 px-3 rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Tenant Details Dialog (Side Panel on Desktop >=768px, Bottom Sheet on Mobile <768px) */}
        <Dialog.Root
          open={Boolean(selectedTenant)}
          onOpenChange={(open) => {
            if (!open) setSelectedTenant(null);
          }}
        >
          <Dialog.Portal>
            {/* Overlay: fixed inset-0, black at 50%, click closes */}
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

            {/* Content: slides over without pushing or resizing page */}
            <Dialog.Content
              className={cn(
                "fixed z-50 flex flex-col bg-card text-foreground shadow-2xl focus:outline-none transition-transform duration-200",
                // Mobile bottom sheet (<768px)
                "bottom-0 left-0 right-0 max-h-[92dvh] rounded-t-2xl border-t border-border",
                "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
                // Desktop side panel (>=768px)
                "md:top-0 md:bottom-0 md:right-0 md:left-auto md:w-[480px] md:max-w-[100vw] md:h-[100dvh] md:max-h-none md:rounded-none md:border-t-0 md:border-l md:border-border",
                "md:data-[state=closed]:slide-out-to-right md:data-[state=open]:slide-in-from-right"
              )}
            >
              {selectedTenant && (
                <>
                  {/* Drag handle for mobile */}
                  <div className="md:hidden pt-3 pb-1 shrink-0">
                    <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30 mx-auto" />
                  </div>

                  {/* Panel Header: flex-shrink-0 and always visible */}
                  <div className="shrink-0 px-6 pt-5 pb-5 border-b border-border space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <Dialog.Title className="text-lg font-bold text-foreground truncate">
                            {selectedTenant.fullName}
                          </Dialog.Title>
                          <LeaseStatusBadge status={selectedTenant.overallStatus} />
                        </div>
                        <Dialog.Description className="sr-only">
                          Tenant details and lease list
                        </Dialog.Description>
                      </div>

                      <Dialog.Close asChild>
                        <button
                          className="p-1.5 -mr-1.5 -mt-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          aria-label="Close"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </Dialog.Close>
                    </div>

                    {/* Email and Phone */}
                    <div className="space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <a
                          href={`mailto:${selectedTenant.email}`}
                          className="hover:text-foreground transition-colors truncate"
                        >
                          {selectedTenant.email}
                        </a>
                      </div>
                      {selectedTenant.phone ? (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <a
                            href={`tel:${selectedTenant.phone}`}
                            className="hover:text-foreground transition-colors"
                          >
                            {selectedTenant.phone}
                          </a>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          <span>No phone number</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Body: flex-1 min-h-0 overflow-y-auto overscroll-contain */}
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-6 space-y-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] md:pb-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Units ({selectedTenant.units?.length ?? new Set(selectedTenant.leases.map((l) => l.unitId)).size})
                      </h3>
                    </div>

                    <div className="space-y-4">
                      {(selectedTenant.units && selectedTenant.units.length > 0
                        ? selectedTenant.units
                        : Array.from(
                            selectedTenant.leases.reduce((map, l) => {
                              const list = map.get(l.unitId) || [];
                              list.push(l);
                              map.set(l.unitId, list);
                              return map;
                            }, new Map<string, ProcessedLease[]>()).entries()
                          ).map(([unitId, leases]) => ({
                            unitId,
                            unitName: leases[0].unitName,
                            propertyId: leases[0].propertyId,
                            propertyName: leases[0].propertyName,
                            currentLease: leases[0],
                            allLeases: leases,
                          }))
                      ).map((unitGroup) => (
                        <div
                          key={unitGroup.unitId}
                          className="rounded-xl border border-border bg-muted/40 p-4 space-y-3.5"
                        >
                          {/* Unit Card Header */}
                          <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
                            <div>
                              <span className="font-semibold text-sm text-foreground block">
                                Unit {unitGroup.unitName}
                              </span>
                              <span className="text-xs text-muted-foreground block mt-0.5">
                                {unitGroup.propertyName}
                              </span>
                            </div>
                            <Link
                              href={`/landlord/properties/${unitGroup.propertyId}/units/${unitGroup.unitId}`}
                              className="text-xs font-medium text-primary hover:underline transition-colors"
                            >
                              View unit ↗
                            </Link>
                          </div>

                          {/* Leases for this unit */}
                          <div className="space-y-3">
                            {unitGroup.allLeases.map((lease) => {
                              const totalRent = lease.totalLeaseRent ?? 0;
                              const paid = lease.totalPaid ?? 0;
                              const outstanding = lease.outstanding ?? 0;

                              return (
                                <div
                                  key={lease.id}
                                  className="rounded-lg border border-border/80 bg-card/60 p-3 space-y-2 text-xs"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium text-foreground">
                                        {formatDateGB(lease.startDate)} – {formatDateGB(lease.endDate)}
                                      </span>
                                      <LeaseStatusBadge status={lease.leaseStatus} />
                                    </div>
                                    <Link
                                      href={`/landlord/properties/${lease.propertyId}/units/${lease.unitId}?lease=${lease.id}`}
                                      className="text-primary hover:underline font-medium shrink-0"
                                    >
                                      View
                                    </Link>
                                  </div>

                                  <div className="flex items-center justify-between gap-2 text-muted-foreground">
                                    <span>
                                      Paid {formatCurrency(paid)} of {formatCurrency(totalRent)}
                                    </span>
                                    {outstanding > 0 && (
                                      <span className="text-destructive font-medium">
                                        {formatCurrency(outstanding)} outstanding
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {/* Cancel Code Invite Dialog */}
        <ConfirmDialog
          isOpen={Boolean(leaseToCancelCode)}
          onClose={() => setLeaseToCancelCode(null)}
          onConfirm={async () => {
            if (!leaseToCancelCode) return;
            try {
              await cancelCodeInviteMutation.mutateAsync({ leaseId: leaseToCancelCode.id });
            } catch {
              // handled
            }
          }}
          title={`Cancel invite for ${leaseToCancelCode?.tenantName || "tenant"}?`}
          description={`The code stops working and Unit ${leaseToCancelCode?.unitName || ""} becomes vacant.`}
          confirmText="Cancel invite"
          cancelText="Keep invite"
          variant="danger"
          isLoading={cancelCodeInviteMutation.isPending}
        />

        {/* Cancel In-App Invitation Dialog */}
        <ConfirmDialog
          isOpen={Boolean(leaseToCancelInApp)}
          onClose={() => setLeaseToCancelInApp(null)}
          onConfirm={async () => {
            if (!leaseToCancelInApp) return;
            try {
              await cancelInvitationMutation.mutateAsync({ leaseId: leaseToCancelInApp.id });
            } catch {
              // handled
            }
          }}
          title="Cancel invitation"
          description={`Are you sure you want to cancel this invitation? Unit ${leaseToCancelInApp?.unitName || ""} will return to vacant.`}
          confirmText="Cancel invitation"
          cancelText="Keep invitation"
          variant="danger"
          isLoading={cancelInvitationMutation.isPending}
        />

        {/* Edit Placeholder Tenant Modal */}
        <Modal
          open={Boolean(leaseToEditTenant)}
          onOpenChange={(open) => {
            if (!open) {
              setLeaseToEditTenant(null);
              setEditTenantError(null);
            }
          }}
          isSaving={updatePlaceholderTenantMutation.isPending}
          size="md"
        >
          <ModalHeader
            title="Edit Tenant Details"
            onClose={() => {
              setLeaseToEditTenant(null);
              setEditTenantError(null);
            }}
            isSaving={updatePlaceholderTenantMutation.isPending}
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = editTenantFullName.trim();
              const email = editTenantEmail.trim();
              if (!name) {
                setEditTenantError("Enter the tenant's full name");
                return;
              }
              if (!email) {
                setEditTenantError("Enter the tenant's email address");
                return;
              }
              setEditTenantError(null);
              updatePlaceholderTenantMutation.mutate({
                leaseId: leaseToEditTenant!.id,
                fullName: name,
                email: email,
              });
            }}
            className="flex flex-col flex-1 min-h-0"
          >
            <ModalBody className="space-y-6">
              {editTenantError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive-tint/20 p-3 text-sm text-destructive">
                  {editTenantError}
                </div>
              )}

              <ModalField label="Full Name" htmlFor="editTenantListFullName" required>
                <input
                  id="editTenantListFullName"
                  type="text"
                  required
                  value={editTenantFullName}
                  onChange={(e) => {
                    setEditTenantFullName(e.target.value);
                    if (editTenantError) setEditTenantError(null);
                  }}
                  className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring text-sm"
                  placeholder="e.g. John Doe"
                />
              </ModalField>

              <ModalField label="Email" htmlFor="editTenantListEmail" required>
                <input
                  id="editTenantListEmail"
                  type="email"
                  required
                  value={editTenantEmail}
                  onChange={(e) => {
                    setEditTenantEmail(e.target.value);
                    if (editTenantError) setEditTenantError(null);
                  }}
                  className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring text-sm"
                  placeholder="e.g. john@example.com"
                />
              </ModalField>
            </ModalBody>

            <ModalFooter
              onCancel={() => {
                setLeaseToEditTenant(null);
                setEditTenantError(null);
              }}
              primaryText="Save"
              isSaving={updatePlaceholderTenantMutation.isPending}
            />
          </form>
        </Modal>
      </main>
    </div>
  );
}

export default function LandlordTenantsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background text-foreground">
          <PageHeader title="Tenant List" />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
            <div className="rounded-xl border border-border bg-card/30 p-6 space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-10 w-full" />
            </div>
          </main>
        </div>
      }
    >
      <LandlordTenantsContent />
    </Suspense>
  );
}
