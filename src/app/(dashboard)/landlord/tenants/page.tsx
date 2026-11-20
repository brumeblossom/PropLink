'use client';

import { useState, useEffect } from "react";
import { trpc } from "@/utils/trpc";
import * as Dialog from "@radix-ui/react-dialog";
import { 
  Users, 
  Search, 
  Mail, 
  Phone, 
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Pencil,
  Trash2
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { ActionMenu } from "@/components/ui/action-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  leaseStatus: "active" | "renewal_due" | "expired" | "upcoming" | "terminated" | "pending" | "invite_sent" | "invite_expired";
  nextDueDate: string | null;
  unpaidPeriods: number;
  nextDueStatus: "overdue" | "today" | "upcoming" | "paid_in_full" | "pending";
  nextDueText: string;
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

interface TenantRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  leases: ProcessedLease[];
  unitDisplay: {
    primaryUnit: string;
    moreCount: number;
  };
  propertyDisplay: string;
  overallStatus: "expired" | "renewal_due" | "active" | "upcoming" | "terminated" | "pending" | "invite_sent" | "invite_expired";
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
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          Invite sent
        </span>
      );
    case "invite_expired":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
          Invite expired
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          Pending
        </span>
      );
    case "expired":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
          Expired
        </span>
      );
    case "renewal_due":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          Renewal due
        </span>
      );
    case "active":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Active
        </span>
      );
    case "upcoming":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
          Upcoming
        </span>
      );
    case "terminated":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-800 text-neutral-400 border border-neutral-700">
          Terminated
        </span>
      );
    default:
      return null;
  }
}

function TwoLineRentDue({ data }: { data: RentDueLines }) {
  if (data.status === "expired") {
    return <span className="text-neutral-500 text-sm">—</span>;
  }
  if (data.status === "paid_in_full") {
    return (
      <span className="text-emerald-400 font-medium text-sm block truncate" title={data.line1}>
        {data.line1}
      </span>
    );
  }
  if (data.status === "overdue") {
    return (
      <div className="leading-tight">
        <div className="text-red-400 font-medium text-sm truncate" title={data.line1}>
          {data.line1}
        </div>
        {data.line2 && (
          <div className="text-neutral-400 text-xs mt-0.5 truncate" title={data.line2}>
            {data.line2}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="leading-tight">
      <div className="text-neutral-200 font-medium text-sm truncate" title={data.line1}>
        {data.line1}
      </div>
      {data.line2 && (
        <div className="text-neutral-400 text-xs mt-0.5 truncate" title={data.line2}>
          {data.line2}
        </div>
      )}
    </div>
  );
}

export default function LandlordTenantsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "past">("all");
  const [leaseStatusFilter, setLeaseStatusFilter] = useState<"" | "active" | "renewal_due" | "expired">("");
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

  const regenerateInviteCodeMutation = trpc.leases.regenerateInviteCode.useMutation({
    onSuccess: (data) => {
      toast(`New code ready. Share it with ${data.tenantName}.`, "success");
      utils.leases.getLandlordTenants.invalidate();
    },
    onError: (err) => {
      toast(err.message, "error");
    },
  });

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

  const resendInvitationMutation = trpc.leases.resendInvitation.useMutation({
    onSuccess: () => {
      toast("Invitation resent", "success");
      utils.leases.getLandlordTenants.invalidate();
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
    <div className="min-h-screen bg-neutral-950 text-white">
      <PageHeader title="Tenant List" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Title row: Heading "Your tenants" with count as small muted pill ("7"), 32px gap under */}
        <div className="flex items-center gap-2.5 mb-8">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Your tenants</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-400">
            {total}
          </span>
        </div>

        {/* Toolbar: directly under heading, no box or border, same style as units table toolbar */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6">
          {/* Search Input: full width on mobile, 280px on desktop */}
          <div className="relative w-full md:w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, email or phone"
              className="w-full pl-9 pr-8 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700 focus:ring-1 focus:ring-neutral-700"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
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
                  setLeaseStatusFilter(e.target.value as "" | "active" | "renewal_due" | "expired");
                  setPage(1);
                }}
                aria-label="Filter by lease status"
              >
                <option value="">All lease statuses</option>
                <option value="active">Active</option>
                <option value="renewal_due">Renewal due</option>
                <option value="expired">Expired</option>
              </Select>
            </div>
          </div>
        </div>

        {/* Content Section */}
        {isLoading ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-neutral-800/40 last:border-0">
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
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/20 py-16 px-4 text-center">
            {hasActiveFilters ? (
              <div className="max-w-md mx-auto space-y-3">
                <Search className="w-10 h-10 text-neutral-500 mx-auto" />
                <h3 className="text-base font-semibold text-white">No tenants match these filters.</h3>
                <p className="text-sm text-neutral-400">
                  Try adjusting your search query, property, or lease status filters.
                </p>
                <div className="pt-2">
                  <Button
                    onClick={clearFilters}
                    className="bg-neutral-800 hover:bg-neutral-700 text-white text-sm h-9 px-4 rounded-lg font-medium"
                  >
                    Clear filters
                  </Button>
                </div>
              </div>
            ) : (
              <div className="max-w-md mx-auto space-y-3">
                <Users className="w-10 h-10 text-neutral-500 mx-auto" />
                <h3 className="text-base font-semibold text-white">No tenants yet.</h3>
                <p className="text-sm text-neutral-400">
                  Invite a tenant from a vacant unit to start tracking leases and payments.
                </p>
                <div className="pt-2">
                  <Link href="/landlord/properties">
                    <Button className="bg-white hover:bg-neutral-200 text-neutral-950 text-sm h-9 px-4 rounded-lg font-semibold">
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
            <div className="hidden md:block rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
              <table className="w-full table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[28%] xl:w-[24%]" />
                  <col className="hidden xl:table-column xl:w-[13%]" />
                  <col className="w-[15%] xl:w-[13%]" />
                  <col className="w-[21%] xl:w-[18%]" />
                  <col className="w-[15%] xl:w-[13%]" />
                  <col className="w-[21%] xl:w-[19%]" />
                </colgroup>
                <thead className="border-b border-neutral-800 bg-neutral-900/70 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">Tenant</th>
                    <th scope="col" className="hidden xl:table-cell px-5 py-3.5">Phone</th>
                    <th scope="col" className="px-5 py-3.5">Unit(s)</th>
                    <th scope="col" className="px-5 py-3.5">Property</th>
                    <th scope="col" className="px-5 py-3.5">Lease status</th>
                    <th scope="col" className="px-5 py-3.5">Next rent due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
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
                          "cursor-pointer transition-colors hover:bg-neutral-850/60",
                          isSelected && "bg-neutral-800/50"
                        )}
                      >
                        {/* Tenant: Name + Email (truncated) */}
                        <td className="px-5 py-4">
                          <div className="font-semibold text-white truncate" title={tenant.fullName}>
                            {tenant.fullName}
                          </div>
                          <div className="text-xs text-neutral-400 mt-0.5 truncate" title={tenant.email}>
                            {tenant.email}
                          </div>
                        </td>

                        {/* Phone: hidden 768-1279px, shows xl */}
                        <td className="hidden xl:table-cell px-5 py-4 text-neutral-300">
                          <div className="truncate" title={tenant.phone || undefined}>
                            {tenant.phone || "—"}
                          </div>
                        </td>

                        {/* Unit(s) */}
                        <td className="px-5 py-4">
                          <div className="flex items-center min-w-0">
                            <span className="font-medium text-white truncate" title={tenant.unitDisplay.primaryUnit}>
                              {tenant.unitDisplay.primaryUnit}
                            </span>
                            {tenant.unitDisplay.moreCount > 0 && (
                              <span className="shrink-0 ml-1.5 px-1.5 py-0.5 rounded text-[11px] font-medium bg-neutral-800 text-neutral-300 border border-neutral-700/60">
                                +{tenant.unitDisplay.moreCount} more
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Property */}
                        <td className="px-5 py-4 text-neutral-300">
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
                    className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-3 cursor-pointer active:bg-neutral-850 hover:border-neutral-700/80 transition-colors"
                  >
                    {/* Name, email, status pill top right */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <div className="font-semibold text-base text-white truncate" title={tenant.fullName}>
                          {tenant.fullName}
                        </div>
                        <div className="text-xs text-neutral-400 truncate" title={tenant.email}>
                          {tenant.email}
                        </div>
                      </div>
                      <div className="shrink-0">
                        <LeaseStatusBadge status={tenant.overallStatus} />
                      </div>
                    </div>

                    {/* Unit(s) · Property */}
                    <div className="flex items-center gap-1.5 text-xs text-neutral-300 min-w-0">
                      <span className="font-medium text-neutral-200 shrink-0">
                        {tenant.unitDisplay.primaryUnit}
                      </span>
                      {tenant.unitDisplay.moreCount > 0 && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[11px] font-medium bg-neutral-800 text-neutral-300 border border-neutral-700/60">
                          +{tenant.unitDisplay.moreCount} more
                        </span>
                      )}
                      <span className="text-neutral-500 shrink-0">·</span>
                      <span className="text-neutral-400 truncate" title={tenant.propertyDisplay}>
                        {tenant.propertyDisplay}
                      </span>
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-neutral-800/60" />

                    {/* Next rent due label left with two-line value right */}
                    <div className="flex items-start justify-between gap-3 text-xs">
                      <span className="text-neutral-500 shrink-0 pt-0.5">Next rent due</span>
                      <div className="text-right">
                        <TwoLineRentDue data={rentDueLines} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-neutral-800/80">
              <div className="text-sm text-neutral-400">
                {total === 0 ? "0 of 0" : `${fromRecord}–${toRecord} of ${total}`}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-white text-sm h-8 px-3 rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>
                <Button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages}
                  className="bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-white text-sm h-8 px-3 rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
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
            {/* Overlay: fixed inset-0, black at 60%, click closes */}
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

            {/* Content: slides over without pushing or resizing page */}
            <Dialog.Content
              className={cn(
                "fixed z-50 flex flex-col bg-neutral-900 text-white shadow-2xl focus:outline-none transition-transform duration-200",
                // Mobile bottom sheet (<768px)
                "bottom-0 left-0 right-0 max-h-[92dvh] rounded-t-2xl border-t border-neutral-800",
                "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
                // Desktop side panel (>=768px)
                "md:top-0 md:bottom-0 md:right-0 md:left-auto md:w-[480px] md:max-w-[100vw] md:h-[100dvh] md:max-h-none md:rounded-none md:border-t-0 md:border-l md:border-neutral-800",
                "md:data-[state=closed]:slide-out-to-right md:data-[state=open]:slide-in-from-right"
              )}
            >
              {selectedTenant && (
                <>
                  {/* Drag handle for mobile */}
                  <div className="md:hidden pt-3 pb-1 shrink-0">
                    <div className="w-12 h-1.5 rounded-full bg-neutral-700 mx-auto" />
                  </div>

                  {/* Panel Header: flex-shrink-0 and always visible */}
                  <div className="shrink-0 px-6 pt-5 pb-5 border-b border-neutral-800 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <Dialog.Title className="text-lg font-bold text-white truncate">
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
                          className="p-1.5 -mr-1.5 -mt-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-700"
                          aria-label="Close"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </Dialog.Close>
                    </div>

                    {/* Email and Phone */}
                    <div className="space-y-1.5 text-xs text-neutral-400">
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                        <a
                          href={`mailto:${selectedTenant.email}`}
                          className="hover:text-neutral-200 transition-colors truncate"
                        >
                          {selectedTenant.email}
                        </a>
                      </div>
                      {selectedTenant.phone ? (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                          <a
                            href={`tel:${selectedTenant.phone}`}
                            className="hover:text-neutral-200 transition-colors"
                          >
                            {selectedTenant.phone}
                          </a>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-neutral-500">
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          <span>No phone number</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Body: flex-1 min-h-0 overflow-y-auto overscroll-contain */}
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-6 space-y-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] md:pb-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                        Units ({selectedTenant.leases.length})
                      </h3>
                    </div>

                    <div className="space-y-3">
                      {selectedTenant.leases.map((lease) => {
                        const leaseDue = formatTwoLineRentDue({
                          leaseStatus: lease.leaseStatus,
                          nextDueDate: lease.nextDueDate,
                          unpaidPeriods: lease.unpaidPeriods,
                          startDate: lease.startDate,
                        });

                        return (
                          <div
                            key={lease.id}
                            className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 space-y-3.5"
                          >
                            {/* Card Header: Unit Flat3 + status pill + actions */}
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-sm text-white">
                                Unit {lease.unitName}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <LeaseStatusBadge status={lease.leaseStatus} />
                                {(lease.leaseStatus === "invite_sent" || lease.leaseStatus === "invite_expired") && (
                                  <ActionMenu
                                    items={
                                      lease.isCodeInvite
                                        ? [
                                            {
                                              label: "New code",
                                              icon: <RefreshCw className="w-4 h-4" />,
                                              onClick: () => regenerateInviteCodeMutation.mutate({ leaseId: lease.id }),
                                            },
                                            {
                                              label: "Edit tenant details",
                                              icon: <Pencil className="w-4 h-4" />,
                                              onClick: () => {
                                                setEditTenantFullName(selectedTenant.fullName);
                                                setEditTenantEmail(selectedTenant.email);
                                                setEditTenantError(null);
                                                setLeaseToEditTenant({
                                                  id: lease.id,
                                                  fullName: selectedTenant.fullName,
                                                  email: selectedTenant.email,
                                                });
                                              },
                                            },
                                            {
                                              label: "Cancel invite",
                                              icon: <Trash2 className="w-4 h-4" />,
                                              variant: "danger",
                                              disabled: Boolean(lease.hasPayments),
                                              disabledTooltip: "This lease has payments. Delete them first.",
                                              onClick: () => {
                                                setLeaseToCancelCode({
                                                  id: lease.id,
                                                  unitName: lease.unitName,
                                                  tenantName: selectedTenant.fullName,
                                                });
                                              },
                                            },
                                          ]
                                        : [
                                            {
                                              label: "Resend invitation",
                                              icon: <RefreshCw className="w-4 h-4" />,
                                              onClick: () => resendInvitationMutation.mutate({ leaseId: lease.id }),
                                            },
                                            {
                                              label: "Cancel invitation",
                                              icon: <Trash2 className="w-4 h-4" />,
                                              variant: "danger",
                                              onClick: () => {
                                                setLeaseToCancelInApp({
                                                  id: lease.id,
                                                  unitName: lease.unitName,
                                                });
                                              },
                                            },
                                          ]
                                    }
                                  />
                                )}
                              </div>
                            </div>

                            {/* 2-column grid: Property, Lease, Rent, Next rent due */}
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              {/* Property */}
                              <div className="space-y-0.5 min-w-0">
                                <div className="text-neutral-500">Property</div>
                                <div
                                  className="font-medium text-neutral-200 truncate"
                                  title={lease.propertyName}
                                >
                                  {lease.propertyName}
                                </div>
                              </div>

                              {/* Lease */}
                              <div className="space-y-0.5 min-w-0">
                                <div className="text-neutral-500">Lease</div>
                                <div className="font-medium text-neutral-200 whitespace-nowrap">
                                  {formatDateGB(lease.startDate)} – {formatDateGB(lease.endDate)}
                                </div>
                              </div>

                              {/* Rent */}
                              <div className="space-y-0.5 min-w-0">
                                <div className="text-neutral-500">Rent</div>
                                <div className="font-medium text-neutral-200 truncate">
                                  {formatCurrency(lease.rentAmount)} / {lease.rentFrequency}
                                </div>
                              </div>

                              {/* Next rent due: same two-line format */}
                              <div className="space-y-0.5 min-w-0">
                                <div className="text-neutral-500">Next rent due</div>
                                <div>
                                  <TwoLineRentDue data={leaseDue} />
                                </div>
                              </div>
                            </div>

                            {/* Renewal note if renewal exists */}
                            {lease.renewal && (
                              <div className="pt-2 border-t border-neutral-800/40 text-xs text-neutral-400">
                                Renewal · {formatDateGB(lease.renewal.startDate)} – {formatDateGB(lease.renewal.endDate)}
                              </div>
                            )}

                            {/* Footer link: View unit ↗ */}
                            <div className="pt-2 border-t border-neutral-800/60">
                              <Link
                                href={`/landlord/properties/${lease.propertyId}/units/${lease.unitId}`}
                                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                              >
                                View unit ↗
                              </Link>
                            </div>
                          </div>
                        );
                      })}
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
        {leaseToEditTenant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md">
            <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 sm:p-8 shadow-2xl flex flex-col space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold tracking-tight text-white">Edit Tenant Details</h2>
                <button
                  type="button"
                  onClick={() => {
                    setLeaseToEditTenant(null);
                    setEditTenantError(null);
                  }}
                  className="text-neutral-400 hover:text-white"
                >
                  &times;
                </button>
              </div>

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
                    leaseId: leaseToEditTenant.id,
                    fullName: name,
                    email: email,
                  });
                }}
                className="space-y-4"
              >
                {editTenantError && (
                  <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-3 text-sm text-red-400">
                    {editTenantError}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label htmlFor="editTenantListFullName" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="editTenantListFullName"
                      type="text"
                      required
                      value={editTenantFullName}
                      onChange={(e) => {
                        setEditTenantFullName(e.target.value);
                        if (editTenantError) setEditTenantError(null);
                      }}
                      className="mt-1.5 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-white focus:outline-none focus:ring-1 focus:ring-white"
                      placeholder="e.g. John Doe"
                    />
                  </div>

                  <div>
                    <label htmlFor="editTenantListEmail" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="editTenantListEmail"
                      type="email"
                      required
                      value={editTenantEmail}
                      onChange={(e) => {
                        setEditTenantEmail(e.target.value);
                        if (editTenantError) setEditTenantError(null);
                      }}
                      className="mt-1.5 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-white focus:outline-none focus:ring-1 focus:ring-white"
                      placeholder="e.g. john@example.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setLeaseToEditTenant(null);
                      setEditTenantError(null);
                    }}
                    className="border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-900"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={updatePlaceholderTenantMutation.isPending}
                    className="bg-white text-neutral-950 hover:bg-neutral-200 font-semibold"
                  >
                    {updatePlaceholderTenantMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
