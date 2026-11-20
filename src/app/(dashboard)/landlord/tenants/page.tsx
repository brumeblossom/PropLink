'use client';

import { useState, useEffect } from "react";
import { trpc } from "@/utils/trpc";
import { 
  Users, 
  Search, 
  Building2, 
  Mail, 
  Phone, 
  Calendar, 
  ArrowUpRight,
  X,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency, cn } from "@/lib/utils";
import { formatDateGB } from "@/lib/billing";

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
  leaseStatus: "active" | "renewal_due" | "expired" | "upcoming" | "terminated";
  nextDueDate: string | null;
  nextDueStatus: "overdue" | "today" | "upcoming" | "paid_in_full";
  nextDueText: string;
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
  overallStatus: "expired" | "renewal_due" | "active" | "upcoming" | "terminated";
  isCurrent: boolean;
  nextRentDue: {
    text: string;
    status: "overdue" | "today" | "upcoming" | "paid_in_full" | "past";
    date: string | null;
  };
}

function LeaseStatusBadge({ status }: { status: string }) {
  switch (status) {
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

function NextRentDueDisplay({
  nextRentDue,
}: {
  nextRentDue: {
    text: string;
    status: "overdue" | "today" | "upcoming" | "paid_in_full" | "past";
    date: string | null;
  };
}) {
  let colorClass = "text-neutral-300";
  if (nextRentDue.status === "overdue") {
    colorClass = "text-red-400 font-medium";
  } else if (nextRentDue.status === "today") {
    colorClass = "text-amber-400 font-medium";
  } else if (nextRentDue.status === "paid_in_full") {
    colorClass = "text-emerald-400 font-medium";
  } else if (nextRentDue.status === "past") {
    colorClass = "text-neutral-500";
  }

  return <span className={cn("text-sm", colorClass)}>{nextRentDue.text}</span>;
}

function TenantDetailContent({ tenant, onClose }: { tenant: TenantRow; onClose: () => void }) {
  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white">{tenant.fullName}</h2>
            <LeaseStatusBadge status={tenant.overallStatus} />
          </div>
          <div className="space-y-1 text-sm text-neutral-400 pt-1">
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
              <a href={`mailto:${tenant.email}`} className="hover:text-neutral-200 transition-colors truncate">
                {tenant.email}
              </a>
            </div>
            {tenant.phone ? (
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                <a href={`tel:${tenant.phone}`} className="hover:text-neutral-200 transition-colors">
                  {tenant.phone}
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
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors shrink-0"
          aria-label="Close panel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="h-px bg-neutral-800/80" />

      {/* Leases Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Leases ({tenant.leases.length})
          </h3>
        </div>

        <div className="space-y-3">
          {tenant.leases.map((lease) => (
            <div
              key={lease.id}
              className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-white">Unit {lease.unitName}</span>
                <LeaseStatusBadge status={lease.leaseStatus} />
              </div>

              <div className="space-y-1.5 text-xs text-neutral-400">
                <div className="flex items-center gap-1.5 text-neutral-300">
                  <Building2 className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <span className="truncate">{lease.propertyName}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <span>
                    {formatDateGB(lease.startDate)} – {formatDateGB(lease.endDate)}
                  </span>
                </div>
                <div className="pt-1 flex items-baseline justify-between text-neutral-300">
                  <span>Rent:</span>
                  <span className="font-medium text-white">
                    {formatCurrency(lease.rentAmount)} / {lease.rentFrequency}
                  </span>
                </div>
                <div className="pt-1 border-t border-neutral-800/60 flex items-center justify-between">
                  <span className="text-neutral-500">Rent due:</span>
                  <NextRentDueDisplay
                    nextRentDue={{
                      text: lease.nextDueText,
                      status: lease.nextDueStatus,
                      date: lease.nextDueDate,
                    }}
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-neutral-800/60">
                <Link
                  href={`/landlord/properties/${lease.propertyId}/units/${lease.unitId}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  View unit
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
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

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Escape key closes side panel / sheet
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedTenant(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
        {/* Header row: Title + Count */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Tenant List</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-900 border border-neutral-800 text-neutral-400">
              {total} {total === 1 ? "tenant" : "tenants"}
            </span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 bg-neutral-900/30 p-3 sm:p-4 rounded-xl border border-neutral-800">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
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

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:flex md:items-center">
            {/* Property Filter */}
            <Select
              value={propertyId}
              onChange={(e) => {
                setPropertyId(e.target.value);
                setPage(1);
              }}
              wrapperClassName="w-full md:w-48"
              aria-label="Filter by property"
            >
              <option value="">All properties</option>
              {properties?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>

            {/* Active / Past Filter */}
            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as "all" | "active" | "past");
                setPage(1);
              }}
              wrapperClassName="w-full md:w-36"
              aria-label="Filter by tenant status"
            >
              <option value="all">All tenants</option>
              <option value="active">Active tenants</option>
              <option value="past">Past tenants</option>
            </Select>

            {/* Lease Status Filter */}
            <Select
              value={leaseStatusFilter}
              onChange={(e) => {
                setLeaseStatusFilter(e.target.value as "" | "active" | "renewal_due" | "expired");
                setPage(1);
              }}
              wrapperClassName="w-full md:w-40"
              aria-label="Filter by lease status"
            >
              <option value="">All lease statuses</option>
              <option value="active">Active</option>
              <option value="renewal_due">Renewal due</option>
              <option value="expired">Expired</option>
            </Select>
          </div>
        </div>

        {/* Main Content Area: Table / Cards + Right Drawer */}
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
          <div className="flex items-start gap-6">
            {/* Desktop Table & Mobile Cards */}
            <div className="flex-1 min-w-0 space-y-4">
              {/* Desktop Table (>= 768px) */}
              <div className="hidden md:block overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900/40">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-neutral-800 bg-neutral-900/70 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                    <tr>
                      <th scope="col" className="px-5 py-3.5">Tenant</th>
                      <th scope="col" className="px-5 py-3.5">Phone</th>
                      <th scope="col" className="px-5 py-3.5">Unit(s)</th>
                      <th scope="col" className="px-5 py-3.5">Property</th>
                      <th scope="col" className="px-5 py-3.5">Lease status</th>
                      <th scope="col" className="px-5 py-3.5">Next rent due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {tenants.map((tenant) => {
                      const isSelected = selectedTenant?.id === tenant.id;
                      return (
                        <tr
                          key={tenant.id}
                          onClick={() => setSelectedTenant(isSelected ? null : tenant)}
                          className={cn(
                            "cursor-pointer transition-colors hover:bg-neutral-850/60",
                            isSelected && "bg-neutral-800/50"
                          )}
                        >
                          {/* Tenant: Name + Email */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            <div className="font-semibold text-white">{tenant.fullName}</div>
                            <div className="text-xs text-neutral-400 mt-0.5">{tenant.email}</div>
                          </td>

                          {/* Phone */}
                          <td className="px-5 py-4 whitespace-nowrap text-neutral-300">
                            {tenant.phone || "—"}
                          </td>

                          {/* Unit(s) */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <span className="font-medium text-white">{tenant.unitDisplay.primaryUnit}</span>
                              {tenant.unitDisplay.moreCount > 0 && (
                                <span className="ml-1.5 px-1.5 py-0.5 rounded text-[11px] font-medium bg-neutral-800 text-neutral-300 border border-neutral-700/60">
                                  +{tenant.unitDisplay.moreCount} more
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Property */}
                          <td className="px-5 py-4 whitespace-nowrap text-neutral-300">
                            {tenant.propertyDisplay}
                          </td>

                          {/* Lease Status */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            <LeaseStatusBadge status={tenant.overallStatus} />
                          </td>

                          {/* Next Rent Due */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            <NextRentDueDisplay nextRentDue={tenant.nextRentDue} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards (< 768px) */}
              <div className="md:hidden space-y-3">
                {tenants.map((tenant) => (
                  <div
                    key={tenant.id}
                    onClick={() => setSelectedTenant(tenant)}
                    className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-2.5 cursor-pointer active:bg-neutral-850 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-base text-white truncate">{tenant.fullName}</span>
                      <LeaseStatusBadge status={tenant.overallStatus} />
                    </div>

                    <div className="flex items-center gap-1.5 text-sm text-neutral-300">
                      <span>{tenant.unitDisplay.primaryUnit}</span>
                      {tenant.unitDisplay.moreCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-neutral-800 text-neutral-300 border border-neutral-700/60">
                          +{tenant.unitDisplay.moreCount} more
                        </span>
                      )}
                      <span className="text-neutral-500">·</span>
                      <span className="text-xs text-neutral-400 truncate">{tenant.propertyDisplay}</span>
                    </div>

                    <div className="pt-2 border-t border-neutral-800/60 flex items-center justify-between text-xs">
                      <span className="text-neutral-500">Next due:</span>
                      <NextRentDueDisplay nextRentDue={tenant.nextRentDue} />
                    </div>
                  </div>
                ))}
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

            {/* Desktop Slide-over / Side Panel (~360px) */}
            {selectedTenant && (
              <aside className="hidden md:block w-[360px] shrink-0 sticky top-24 rounded-xl border border-neutral-800 bg-neutral-900/95 backdrop-blur-md p-5 shadow-2xl">
                <TenantDetailContent
                  tenant={selectedTenant}
                  onClose={() => setSelectedTenant(null)}
                />
              </aside>
            )}
          </div>
        )}

        {/* Mobile Bottom Sheet (< 768px) */}
        {selectedTenant && (
          <div className="md:hidden">
            {/* Dimmed backdrop */}
            <div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity"
              onClick={() => setSelectedTenant(null)}
            />
            {/* Bottom Sheet */}
            <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-neutral-800 bg-neutral-900 p-6 pb-8 shadow-2xl animate-in slide-in-from-bottom duration-200">
              {/* Drag Handle */}
              <div className="w-12 h-1.5 rounded-full bg-neutral-700 mx-auto mb-4" />
              <TenantDetailContent
                tenant={selectedTenant}
                onClose={() => setSelectedTenant(null)}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
