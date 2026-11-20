'use client';

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/utils/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Select } from "@/components/ui/select";
import { formatCurrency, cn } from "@/lib/utils";
import {
  formatDateGB,
  formatLagosYMD,
  formatTwoLineRentDue,
  getLeaseBalance,
  type RentDueLines,
} from "@/lib/billing";
import { Search, Inbox } from "lucide-react";

function computeLeaseStatus(
  lease: {
    startDate: Date | string;
    endDate: Date | string;
    renewalWindowDays?: number | null;
    terminatedAt?: Date | string | null;
  },
  today = new Date()
): "active" | "renewal_due" | "expired" | "upcoming" | "terminated" {
  if (lease.terminatedAt) return "terminated";
  const todayStr = formatLagosYMD(today);
  const startStr = formatLagosYMD(lease.startDate);
  const endStr = formatLagosYMD(lease.endDate);

  if (todayStr < startStr) return "upcoming";
  if (todayStr > endStr) return "expired";

  const renewalDate = new Date(lease.endDate);
  renewalDate.setDate(renewalDate.getDate() - (lease.renewalWindowDays ?? 60));
  const renewalStr = formatLagosYMD(renewalDate);

  if (todayStr >= renewalStr) return "renewal_due";
  return "active";
}

function StatusBadge({
  status,
}: {
  status: "active" | "renewal_due" | "expired" | "upcoming" | "terminated";
}) {
  switch (status) {
    case "active":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-950/40 border border-emerald-900/40 text-emerald-400">
          Active
        </span>
      );
    case "renewal_due":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-950/40 border border-amber-900/40 text-amber-400">
          Renewal due
        </span>
      );
    case "upcoming":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-950/40 border border-blue-900/40 text-blue-400">
          Upcoming
        </span>
      );
    case "expired":
    case "terminated":
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-850 border border-neutral-800 text-neutral-400">
          Ended
        </span>
      );
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
      <div className="leading-tight text-right md:text-left">
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
    <div className="leading-tight text-right md:text-left">
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

export default function TenantHomePage() {
  const router = useRouter();
  const { data: user, isLoading: isLoadingUser } = trpc.auth.me.useQuery();
  const { data: leases, isLoading: isLoadingLeases } = trpc.leases.getMine.useQuery();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "renewal_due" | "upcoming" | "ended"
  >("all");

  const today = useMemo(() => new Date(), []);

  // Compute metrics using running / active leases per current-lease rule
  const {
    activeLeasesCount,
    distinctLandlordsCount,
    totalOutstanding,
    nextPayment,
    processedLeases,
  } = useMemo(() => {
    if (!leases) {
      return {
        activeLeasesCount: 0,
        distinctLandlordsCount: 0,
        totalOutstanding: 0,
        nextPayment: null,
        processedLeases: [],
      };
    }

    const processed = leases.map((lease) => {
      const leaseStatus = computeLeaseStatus(lease, today);
      const balance = getLeaseBalance(
        {
          startDate: lease.startDate,
          endDate: lease.endDate,
          rentAmount: lease.rentAmount,
          rentFrequency: lease.rentFrequency,
        },
        lease.payments || [],
        today
      );

      const rentDueLines = formatTwoLineRentDue({
        leaseStatus,
        nextDueDate: balance.nextDueDate,
        unpaidPeriods: balance.unpaidPeriods,
        startDate: lease.startDate,
        todayInput: today,
      });

      return {
        ...lease,
        leaseStatus,
        balance,
        rentDueLines,
      };
    });

    // Active leases are running today (active or renewal_due)
    const activeRunning = processed.filter(
      (l) => l.leaseStatus === "active" || l.leaseStatus === "renewal_due"
    );

    const activeCount = activeRunning.length;

    const landlordKeys = new Set(
      activeRunning.map(
        (l) => l.unit.property.landlord.email || l.unit.property.landlord.fullName
      )
    );
    const landlordsCount = landlordKeys.size;

    const outstandingSum = activeRunning.reduce(
      (acc, l) => acc + (l.balance.outstanding > 0 ? l.balance.outstanding : 0),
      0
    );

    // Find earliest next payment across active leases with a nextDueDate
    let earliestPayment: { amount: number; dateStr: string; unitName: string } | null = null;
    let earliestDueDate: Date | null = null;

    for (const l of activeRunning) {
      if (l.balance.nextDueDate) {
        const due = new Date(l.balance.nextDueDate);
        if (!earliestDueDate || due < earliestDueDate) {
          earliestDueDate = due;
          earliestPayment = {
            amount: Number(l.rentAmount) || 0,
            dateStr: formatDateGB(l.balance.nextDueDate),
            unitName: `Unit ${l.unit.unitNumber}`,
          };
        }
      }
    }

    return {
      activeLeasesCount: activeCount,
      distinctLandlordsCount: landlordsCount,
      totalOutstanding: outstandingSum,
      nextPayment: earliestPayment,
      processedLeases: processed,
    };
  }, [leases, today]);

  // Filter rentals for table and mobile cards
  const filteredRentals = useMemo(() => {
    return processedLeases.filter((l) => {
      // Status filter
      if (statusFilter === "all") {
        // Current and upcoming; ended only when filter says Ended
        if (l.leaseStatus === "expired" || l.leaseStatus === "terminated") {
          return false;
        }
      } else if (statusFilter === "active") {
        if (l.leaseStatus !== "active") return false;
      } else if (statusFilter === "renewal_due") {
        if (l.leaseStatus !== "renewal_due") return false;
      } else if (statusFilter === "upcoming") {
        if (l.leaseStatus !== "upcoming") return false;
      } else if (statusFilter === "ended") {
        if (l.leaseStatus !== "expired" && l.leaseStatus !== "terminated") {
          return false;
        }
      }

      // Search filter: property, unit, landlord
      if (search.trim()) {
        const term = search.trim().toLowerCase();
        const propName = l.unit.property.name.toLowerCase();
        const propAddr = (l.unit.property.address || "").toLowerCase();
        const unitNum = l.unit.unitNumber.toLowerCase();
        const landName = (l.unit.property.landlord.fullName || "").toLowerCase();
        const landEmail = (l.unit.property.landlord.email || "").toLowerCase();

        const match =
          propName.includes(term) ||
          propAddr.includes(term) ||
          unitNum.includes(term) ||
          landName.includes(term) ||
          landEmail.includes(term);

        if (!match) return false;
      }

      return true;
    });
  }, [processedLeases, statusFilter, search]);

  const firstName = user?.fullName ? user.fullName.trim().split(" ")[0] : "Tenant";

  if (isLoadingUser || isLoadingLeases) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white">
        <PageHeader title="Home" />
        <PageContainer className="space-y-8">
          <div>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-80 mt-2" />
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 min-h-[84px] space-y-2"
              >
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-28" />
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-10 w-full" />
            <div className="rounded-xl border border-neutral-800 p-4 space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
        </PageContainer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <PageHeader title="Home" />

      <PageContainer className="space-y-8">
        {/* Welcome Heading */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white font-sans">
            Welcome back, {firstName}
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Your rentals, payments and documents in one place.
          </p>
        </div>

        {/* Pending invitations banner(s) slot directly under heading, ABOVE metric cards (Prompt 14) */}
        {/* Pending invitations banner slot (Prompt 14) */}

        {/* 4 Metric Cards */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          {/* Active leases */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 sm:p-5 backdrop-blur-sm min-w-0 flex flex-col justify-between min-h-[84px]">
            <div className="text-xs font-medium text-neutral-400 truncate">
              Active leases
            </div>
            <div
              className="text-2xl font-bold tracking-tight text-white truncate whitespace-nowrap leading-tight mt-1"
              title={String(activeLeasesCount)}
            >
              {activeLeasesCount}
            </div>
          </div>

          {/* Landlords */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 sm:p-5 backdrop-blur-sm min-w-0 flex flex-col justify-between min-h-[84px]">
            <div className="text-xs font-medium text-neutral-400 truncate">
              Landlords
            </div>
            <div
              className="text-2xl font-bold tracking-tight text-white truncate whitespace-nowrap leading-tight mt-1"
              title={String(distinctLandlordsCount)}
            >
              {distinctLandlordsCount}
            </div>
          </div>

          {/* Outstanding */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 sm:p-5 backdrop-blur-sm min-w-0 flex flex-col justify-between min-h-[84px]">
            <div className="text-xs font-medium text-neutral-400 truncate">
              Outstanding
            </div>
            <div
              className={cn(
                "text-2xl font-bold tracking-tight truncate whitespace-nowrap leading-tight mt-1",
                totalOutstanding > 0 ? "text-red-400" : "text-white"
              )}
              title={totalOutstanding > 0 ? formatCurrency(totalOutstanding) : "₦0"}
            >
              {totalOutstanding > 0 ? formatCurrency(totalOutstanding) : "₦0"}
            </div>
          </div>

          {/* Next payment */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 sm:p-5 backdrop-blur-sm min-w-0 flex flex-col justify-between min-h-[84px]">
            <div className="text-xs font-medium text-neutral-400 truncate">
              Next payment
            </div>
            {nextPayment ? (
              <div className="min-w-0 mt-1">
                <div
                  className="text-2xl font-bold tracking-tight text-white truncate whitespace-nowrap leading-tight"
                  title={formatCurrency(nextPayment.amount)}
                >
                  {formatCurrency(nextPayment.amount)}
                </div>
                <div
                  className="text-xs text-neutral-400 truncate mt-0.5"
                  title={`${nextPayment.dateStr} · ${nextPayment.unitName}`}
                >
                  {nextPayment.dateStr} · {nextPayment.unitName}
                </div>
              </div>
            ) : (
              <div className="text-2xl font-bold tracking-tight text-neutral-500 truncate whitespace-nowrap leading-tight mt-1">
                —
              </div>
            )}
          </div>
        </div>

        {/* Your rentals section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white font-sans">Your rentals</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-neutral-900 border border-neutral-800 text-neutral-400">
              {filteredRentals.length}
            </span>
          </div>

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search property, unit or landlord"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-neutral-900/40 border border-neutral-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
              />
            </div>

            <div className="w-full sm:w-48 shrink-0">
              <Select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value as "all" | "active" | "renewal_due" | "upcoming" | "ended"
                  )
                }
                className="w-full h-9 text-xs"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="renewal_due">Renewal due</option>
                <option value="upcoming">Upcoming</option>
                <option value="ended">Ended</option>
              </Select>
            </div>
          </div>

          {/* Desktop Table (>= 768px) */}
          <div className="hidden md:block rounded-xl border border-neutral-800 bg-neutral-900/20 overflow-hidden">
            <table className="w-full table-fixed divide-y divide-neutral-800/80 text-left text-sm">
              <thead className="bg-neutral-900/60 text-xs font-medium text-neutral-400 uppercase tracking-wider">
                <tr>
                  <th scope="col" className="w-[24%] px-4 py-3">
                    Property
                  </th>
                  <th scope="col" className="w-[11%] px-4 py-3">
                    Unit
                  </th>
                  <th scope="col" className="w-[20%] px-4 py-3">
                    Landlord
                  </th>
                  <th scope="col" className="w-[14%] px-4 py-3">
                    Rent
                  </th>
                  <th scope="col" className="w-[16%] px-4 py-3">
                    Lease period
                  </th>
                  <th scope="col" className="w-[15%] px-4 py-3">
                    Next rent due
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {filteredRentals.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center text-neutral-500">
                      <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm font-medium text-neutral-300">No rentals yet.</p>
                      <p className="text-xs text-neutral-500 mt-1">
                        When a landlord adds you to a unit, it shows up here.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredRentals.map((lease) => (
                    <tr
                      key={lease.id}
                      onClick={() => router.push(`/tenant/rentals/${lease.id}`)}
                      className="hover:bg-neutral-900/40 transition-colors cursor-pointer group"
                    >
                      {/* Property */}
                      <td className="px-4 py-3.5 min-w-0">
                        <div
                          className="font-medium text-white truncate group-hover:text-neutral-200"
                          title={lease.unit.property.name}
                        >
                          {lease.unit.property.name}
                        </div>
                        {lease.unit.property.address && (
                          <div
                            className="text-xs text-neutral-400 truncate mt-0.5"
                            title={lease.unit.property.address}
                          >
                            {lease.unit.property.address}
                          </div>
                        )}
                      </td>

                      {/* Unit */}
                      <td className="px-4 py-3.5 min-w-0">
                        <span
                          className="text-sm font-medium text-neutral-200 truncate block"
                          title={`Unit ${lease.unit.unitNumber}`}
                        >
                          Unit {lease.unit.unitNumber}
                        </span>
                      </td>

                      {/* Landlord */}
                      <td className="px-4 py-3.5 min-w-0">
                        <div
                          className="text-sm font-medium text-white truncate"
                          title={lease.unit.property.landlord.fullName}
                        >
                          {lease.unit.property.landlord.fullName}
                        </div>
                        <div
                          className="text-xs text-neutral-400 truncate mt-0.5"
                          title={lease.unit.property.landlord.email}
                        >
                          {lease.unit.property.landlord.email}
                        </div>
                      </td>

                      {/* Rent */}
                      <td className="px-4 py-3.5 min-w-0 text-neutral-200 whitespace-nowrap">
                        <span className="font-medium text-white">
                          {formatCurrency(lease.rentAmount)}
                        </span>
                        <span className="text-neutral-400 text-xs">
                          {" "}/ {lease.rentFrequency}
                        </span>
                      </td>

                      {/* Lease period */}
                      <td className="px-4 py-3.5 min-w-0 text-xs text-neutral-300 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span>
                            {formatDateGB(lease.startDate)} – {formatDateGB(lease.endDate)}
                          </span>
                          <StatusBadge status={lease.leaseStatus} />
                        </div>
                      </td>

                      {/* Next rent due */}
                      <td className="px-4 py-3.5 min-w-0">
                        <TwoLineRentDue data={lease.rentDueLines} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards (< 768px) */}
          <div className="md:hidden space-y-3">
            {filteredRentals.length === 0 ? (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-8 text-center text-neutral-500">
                <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium text-neutral-300">No rentals yet.</p>
                <p className="text-xs text-neutral-500 mt-1">
                  When a landlord adds you to a unit, it shows up here.
                </p>
              </div>
            ) : (
              filteredRentals.map((lease) => (
                <div
                  key={lease.id}
                  onClick={() => router.push(`/tenant/rentals/${lease.id}`)}
                  className="rounded-xl border border-neutral-800 bg-neutral-900/30 hover:bg-neutral-900/50 transition-colors p-4 space-y-3 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-white truncate">
                        Unit {lease.unit.unitNumber} · {lease.unit.property.name}
                      </div>
                      <div className="text-xs text-neutral-400 truncate mt-0.5">
                        {lease.unit.property.landlord.fullName}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <StatusBadge status={lease.leaseStatus} />
                    </div>
                  </div>

                  <div className="text-xs text-neutral-300">
                    <span className="font-medium text-white">
                      {formatCurrency(lease.rentAmount)}
                    </span>
                    <span className="text-neutral-400">/{lease.rentFrequency}</span>
                    <span className="text-neutral-500 mx-1.5">·</span>
                    <span>
                      {formatDateGB(lease.startDate)} – {formatDateGB(lease.endDate)}
                    </span>
                  </div>

                  <div className="pt-2.5 border-t border-neutral-800/60 flex items-center justify-between text-xs">
                    <span className="text-neutral-400">Next rent due</span>
                    <TwoLineRentDue data={lease.rentDueLines} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
