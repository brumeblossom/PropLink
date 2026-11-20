'use client';

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/utils/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, cn } from "@/lib/utils";
import {
  formatDateGB,
  formatLagosYMD,
  formatTwoLineRentDue,
  getLeaseBalance,
  getPeriodStarts,
  type RentDueLines,
} from "@/lib/billing";
import { formatRentFrequency } from "@/lib/rent";
import { Search, Inbox, X } from "lucide-react";

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
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const { data: user, isLoading: isLoadingUser } = trpc.auth.me.useQuery();
  const { data: leases, isLoading: isLoadingLeases } = trpc.leases.getMine.useQuery();
  const { data: pendingInvitations } = trpc.leases.getPendingInvitations.useQuery();

  type PendingInvitation = NonNullable<typeof pendingInvitations>[number];
  const [viewingInvitation, setViewingInvitation] = useState<PendingInvitation | null>(null);
  const [declineConfirmInvitation, setDeclineConfirmInvitation] = useState<PendingInvitation | null>(null);

  const acceptInvitation = trpc.leases.acceptInvitation.useMutation({
    onSuccess: (data) => {
      toast(`You've joined ${data.unitNumber}`, "success");
      utils.leases.getPendingInvitations.invalidate();
      utils.leases.getMine.invalidate();
      utils.notifications.listReceived.invalidate();
      setViewingInvitation(null);
    },
    onError: (err) => {
      toast(err.message, "error");
    },
  });

  const declineInvitation = trpc.leases.declineInvitation.useMutation({
    onSuccess: () => {
      toast("Invitation declined", "info");
      utils.leases.getPendingInvitations.invalidate();
      utils.notifications.listReceived.invalidate();
      setDeclineConfirmInvitation(null);
      setViewingInvitation(null);
    },
    onError: (err) => {
      toast(err.message, "error");
    },
  });

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

    // Find earliest next payment from today onwards across active leases
    let earliestPayment: { amount: number; dateStr: string; unitName: string } | null = null;
    let earliestDueDate: Date | null = null;
    const todayStr = formatLagosYMD(today);

    for (const l of activeRunning) {
      const rentAmount = Number(l.rentAmount) || 0;
      if (rentAmount <= 0) continue;

      const periodStarts = getPeriodStarts({
        startDate: l.startDate,
        endDate: l.endDate,
        rentFrequency: l.rentFrequency,
      });

      // Confirmed payments on this lease
      const confirmedPayments = (l.payments || []).filter(
        (p) => !p.status || p.status === "confirmed"
      );
      const paidToDate = confirmedPayments.reduce(
        (sum: number, p) => sum + Number(p.amount || 0),
        0
      );

      // Periods strictly before today
      const periodsBeforeToday = periodStarts.filter(
        (p) => formatLagosYMD(p) < todayStr
      );
      const pastPeriodsRent = periodsBeforeToday.length * rentAmount;

      // Excess paid covering future periods from today onwards
      const futureCredit = Math.max(0, paidToDate - pastPeriodsRent);

      // Future periods on or after today
      const futurePeriods = periodStarts.filter(
        (p) => formatLagosYMD(p) >= todayStr
      );

      let nextDueForThisLease: Date | null = null;
      let remainingCredit = futureCredit;
      for (const p of futurePeriods) {
        if (remainingCredit >= rentAmount) {
          remainingCredit -= rentAmount;
        } else {
          nextDueForThisLease = p;
          break;
        }
      }

      if (nextDueForThisLease) {
        const due = new Date(nextDueForThisLease);
        if (!earliestDueDate || due < earliestDueDate) {
          earliestDueDate = due;
          earliestPayment = {
            amount: rentAmount,
            dateStr: formatDateGB(nextDueForThisLease),
            unitName: l.unit.unitNumber,
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
        <PageContainer className="space-y-6">
          <div>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-80 mt-2" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-5 py-4 min-h-[84px] flex flex-col justify-center space-y-2"
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

      <PageContainer className="space-y-6">
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
        {pendingInvitations && pendingInvitations.length > 0 && (
          <div className="space-y-3">
            {pendingInvitations.map((inv) => {
              const landlordName = inv.unit.property.landlord.fullName || "Landlord";
              const rentText =
                Number(inv.rentAmount) > 0
                  ? `${formatCurrency(inv.rentAmount)} / ${formatRentFrequency(inv.rentFrequency)}`
                  : "Rent TBD";
              const periodText = `${formatDateGB(inv.startDate)} – ${formatDateGB(inv.endDate)}`;

              let expiryText = "";
              if (inv.invitationExpiresAt) {
                const diffMs = new Date(inv.invitationExpiresAt).getTime() - Date.now();
                const diffDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                if (diffDays > 1) {
                  expiryText = `expires in ${diffDays} days`;
                } else if (diffDays === 1) {
                  expiryText = "expires in 1 day";
                } else {
                  expiryText = "expires today";
                }
              }

              return (
                <div
                  key={inv.id}
                  className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                  <div className="space-y-1">
                    <h3 className="text-sm sm:text-base font-semibold text-white">
                      {landlordName} invited you to rent {inv.unit.unitNumber} at {inv.unit.property.name}
                    </h3>
                    <p className="text-xs sm:text-sm text-neutral-400">
                      {rentText} · {periodText}{expiryText ? ` · ${expiryText}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewingInvitation(inv)}
                      className="text-xs h-8 px-3 border-neutral-800 hover:bg-neutral-800"
                    >
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeclineConfirmInvitation(inv)}
                      className="text-xs h-8 px-3 border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800"
                    >
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => acceptInvitation.mutate({ leaseId: inv.id })}
                      disabled={acceptInvitation.isPending}
                      className="text-xs h-8 px-3 bg-white text-neutral-950 hover:bg-neutral-200 font-semibold"
                    >
                      Accept
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 4 Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Active leases */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-5 py-4 min-h-[84px] flex flex-col justify-center">
            <span className="block text-xs text-neutral-400">Active leases</span>
            <span
              className="text-2xl font-semibold text-white mt-1 block truncate whitespace-nowrap"
              title={String(activeLeasesCount)}
            >
              {activeLeasesCount}
            </span>
          </div>

          {/* Landlords */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-5 py-4 min-h-[84px] flex flex-col justify-center">
            <span className="block text-xs text-neutral-400">Landlords</span>
            <span
              className="text-2xl font-semibold text-white mt-1 block truncate whitespace-nowrap"
              title={String(distinctLandlordsCount)}
            >
              {distinctLandlordsCount}
            </span>
          </div>

          {/* Outstanding */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-5 py-4 min-h-[84px] flex flex-col justify-center">
            <span className="block text-xs text-neutral-400">Outstanding</span>
            <span
              className={cn(
                "text-2xl font-semibold mt-1 block truncate whitespace-nowrap",
                totalOutstanding > 0 ? "text-red-400" : "text-white"
              )}
              title={totalOutstanding > 0 ? formatCurrency(totalOutstanding) : "₦0"}
            >
              {totalOutstanding > 0 ? formatCurrency(totalOutstanding) : "₦0"}
            </span>
          </div>

          {/* Next payment */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-5 py-4 min-h-[84px] flex flex-col justify-center">
            <span className="block text-xs text-neutral-400">Next payment</span>
            {nextPayment ? (
              <div className="min-w-0 mt-1">
                <span
                  className="text-2xl font-semibold text-white block truncate whitespace-nowrap leading-tight"
                  title={formatCurrency(nextPayment.amount)}
                >
                  {formatCurrency(nextPayment.amount)}
                </span>
                <span
                  className="text-xs text-neutral-400 block truncate mt-0.5 whitespace-nowrap"
                  title={`${nextPayment.dateStr} · ${nextPayment.unitName}`}
                >
                  {nextPayment.dateStr} · {nextPayment.unitName}
                </span>
              </div>
            ) : (
              <span className="text-2xl font-semibold text-neutral-500 mt-1 block truncate whitespace-nowrap leading-tight">
                —
              </span>
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

          {/* Toolbar: search 280px wide on left with Status filter right beside it */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative w-full sm:w-[280px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Search property, unit or landlord"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700 focus:ring-1 focus:ring-neutral-700 transition-colors"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="w-full sm:w-44">
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

          {/* Desktop Table (>= 768px): fixed layout with colgroup */}
          <div className="hidden md:block rounded-xl border border-neutral-800 bg-neutral-900/20 overflow-hidden">
            <table className="w-full table-fixed divide-y divide-neutral-800/80 text-left text-sm">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[10%]" />
                <col className="w-[19%]" />
                <col className="w-[13%]" />
                <col className="w-[16%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead className="border-b border-neutral-800 bg-neutral-900/70 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-5 py-3.5">
                    Property
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Unit
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Landlord
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Rent
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Lease period
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Status
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Next rent due
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {filteredRentals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center text-neutral-500">
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
                      tabIndex={0}
                      onClick={() => router.push(`/tenant/rentals/${lease.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/tenant/rentals/${lease.id}`);
                        }
                      }}
                      className="h-16 hover:bg-neutral-850/60 transition-colors cursor-pointer group focus:outline-none focus:bg-neutral-800/50"
                    >
                      {/* Property (20%) */}
                      <td className="px-5 py-3.5 min-w-0 overflow-hidden">
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

                      {/* Unit (10%) */}
                      <td className="px-5 py-3.5 min-w-0 overflow-hidden">
                        <span
                          className="text-sm font-medium text-neutral-200 truncate block"
                          title={lease.unit.unitNumber}
                        >
                          {lease.unit.unitNumber}
                        </span>
                      </td>

                      {/* Landlord (19%) */}
                      <td className="px-5 py-3.5 min-w-0 overflow-hidden">
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

                      {/* Rent (13%) */}
                      <td className="px-5 py-3.5 min-w-0 overflow-hidden whitespace-nowrap">
                        <span
                          className="font-medium text-white truncate block text-sm"
                          title={`${formatCurrency(lease.rentAmount)} / ${formatRentFrequency(lease.rentFrequency)}`}
                        >
                          {formatCurrency(lease.rentAmount)}
                          <span className="text-neutral-400 text-xs font-normal">
                            {" "}/ {formatRentFrequency(lease.rentFrequency)}
                          </span>
                        </span>
                      </td>

                      {/* Lease period (16%) */}
                      <td className="px-5 py-3.5 min-w-0 overflow-hidden text-xs text-neutral-300 whitespace-nowrap">
                        <span
                          className="truncate block"
                          title={`${formatDateGB(lease.startDate)} – ${formatDateGB(lease.endDate)}`}
                        >
                          {formatDateGB(lease.startDate)} – {formatDateGB(lease.endDate)}
                        </span>
                      </td>

                      {/* Status (10%) */}
                      <td className="px-5 py-3.5 min-w-0 overflow-hidden whitespace-nowrap">
                        <StatusBadge status={lease.leaseStatus} />
                      </td>

                      {/* Next rent due (12%) */}
                      <td className="px-5 py-3.5 min-w-0 overflow-hidden">
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
                        {lease.unit.unitNumber} · {lease.unit.property.name}
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
                    <span className="text-neutral-400">
                      {" "}/ {formatRentFrequency(lease.rentFrequency)}
                    </span>
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

      {/* View Terms Dialog */}
      {viewingInvitation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-6 sm:p-8 shadow-2xl flex flex-col space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold tracking-tight text-white">Rental Invitation</h2>
              <button
                onClick={() => setViewingInvitation(null)}
                className="text-neutral-400 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm divide-y divide-neutral-800/60">
              <div className="pt-1">
                <span className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">Property</span>
                <span className="font-semibold text-white mt-1 block">{viewingInvitation.unit.property.name}</span>
                <p className="text-neutral-400 text-xs mt-0.5">
                  {viewingInvitation.unit.property.address}, {viewingInvitation.unit.property.city}, {viewingInvitation.unit.property.state}
                </p>
              </div>

              <div className="pt-3">
                <span className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">Unit</span>
                <span className="font-semibold text-white mt-1 block">{viewingInvitation.unit.unitNumber}</span>
              </div>

              <div className="pt-3">
                <span className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">Landlord</span>
                <span className="font-semibold text-white mt-1 block">
                  {viewingInvitation.unit.property.landlord.fullName || "Landlord"}
                </span>
                <p className="text-neutral-400 text-xs mt-0.5">{viewingInvitation.unit.property.landlord.email}</p>
              </div>

              <div className="pt-3">
                <span className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">Rental Period</span>
                <span className="font-semibold text-white mt-1 block">
                  {formatDateGB(viewingInvitation.startDate)} – {formatDateGB(viewingInvitation.endDate)}
                </span>
              </div>

              <div className="pt-3">
                <span className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">Rent</span>
                <span className="font-semibold text-white mt-1 block">
                  {Number(viewingInvitation.rentAmount) > 0
                    ? `${formatCurrency(viewingInvitation.rentAmount)} / ${formatRentFrequency(viewingInvitation.rentFrequency)}`
                    : "TBD"}
                </span>
              </div>

              <div className="pt-3">
                <span className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">Deposit</span>
                <span className="font-semibold text-white mt-1 block">
                  {viewingInvitation.depositAmount ? formatCurrency(viewingInvitation.depositAmount) : "None"}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
              <Button
                variant="outline"
                onClick={() => setDeclineConfirmInvitation(viewingInvitation)}
                className="border-neutral-800 text-neutral-400 hover:text-white"
              >
                Decline
              </Button>
              <Button
                onClick={() => acceptInvitation.mutate({ leaseId: viewingInvitation.id })}
                disabled={acceptInvitation.isPending}
                className="bg-white text-neutral-950 hover:bg-neutral-200 font-semibold"
              >
                Accept
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Decline Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(declineConfirmInvitation)}
        onClose={() => setDeclineConfirmInvitation(null)}
        onConfirm={async () => {
          if (!declineConfirmInvitation) return;
          await declineInvitation.mutateAsync({ leaseId: declineConfirmInvitation.id });
        }}
        title="Decline invitation"
        description={
          declineConfirmInvitation
            ? `Are you sure you want to decline this invitation to rent ${declineConfirmInvitation.unit.unitNumber} at ${declineConfirmInvitation.unit.property.name}?`
            : "Are you sure you want to decline this invitation?"
        }
        confirmText="Decline invitation"
        cancelText="Cancel"
        variant="danger"
        isLoading={declineInvitation.isPending}
      />
    </div>
  );
}
