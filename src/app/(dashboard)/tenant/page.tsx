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
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, cn } from "@/lib/utils";
import {
  formatDateGB,
  formatLagosYMD,
  formatTwoLineRentDue,
  getLeaseBalance,
  type RentDueLines,
} from "@/lib/billing";
import { formatRentFrequency } from "@/lib/rent";
import { Search, Inbox, X, Home, Users, CreditCard, Calendar } from "lucide-react";

function computeLeaseStatus(
  lease: {
    startDate: Date | string;
    endDate?: Date | string | null;
    renewalWindowDays?: number | null;
    terminatedAt?: Date | string | null;
    unit?: {
      deletedAt?: Date | string | null;
      property?: {
        deletedAt?: Date | string | null;
      } | null;
    } | null;
  },
  today = new Date()
): "active" | "ended" | "moved_out" | "upcoming" | "removed" {
  if (lease.unit?.deletedAt || lease.unit?.property?.deletedAt) return "removed";
  if (lease.terminatedAt) return "moved_out";
  const todayStr = formatLagosYMD(today);
  const startStr = formatLagosYMD(lease.startDate);
  const endStr = lease.endDate ? formatLagosYMD(lease.endDate) : null;

  if (todayStr < startStr) return "upcoming";
  if (endStr && todayStr >= endStr) return "ended";
  return "active";
}

function StatusBadge({
  status,
}: {
  status: "active" | "ended" | "moved_out" | "upcoming" | "removed";
}) {
  switch (status) {
    case "removed":
      return (
        <span className="inline-flex items-center px-2.5 h-[22px] rounded-full text-xs font-semibold bg-muted text-muted-foreground">
          Removed
        </span>
      );
    case "active":
      return (
        <span className="inline-flex items-center px-2.5 h-[22px] rounded-full text-xs font-semibold bg-success-tint text-success">
          Active
        </span>
      );
    case "upcoming":
      return (
        <span className="inline-flex items-center px-2.5 h-[22px] rounded-full text-xs font-semibold bg-warning-tint text-warning">
          Upcoming
        </span>
      );
    case "moved_out":
      return (
        <span className="inline-flex items-center px-2.5 h-[22px] rounded-full text-xs font-semibold bg-muted text-muted-foreground">
          Moved out
        </span>
      );
    case "ended":
    default:
      return (
        <span className="inline-flex items-center px-2.5 h-[22px] rounded-full text-xs font-semibold bg-muted text-muted-foreground">
          Ended
        </span>
      );
  }
}

function TwoLineRentDue({ data }: { data: RentDueLines }) {
  if (data.status === "expired") {
    return <span className="text-subtle-foreground text-sm">—</span>;
  }
  if (data.status === "paid_in_full") {
    return (
      <span className="text-success font-medium text-sm block whitespace-nowrap" title={data.line1}>
        {data.line1}
      </span>
    );
  }
  if (data.status === "overdue") {
    return (
      <div className="leading-tight text-right md:text-left whitespace-nowrap">
        <div className="text-destructive font-medium text-sm whitespace-nowrap" title={data.line1}>
          {data.line1}
        </div>
        {data.line2 && (
          <div className="text-muted-foreground text-xs mt-0.5 whitespace-nowrap" title={data.line2}>
            {data.line2}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="leading-tight text-right md:text-left whitespace-nowrap">
      <div className="text-foreground font-medium text-sm whitespace-nowrap" title={data.line1}>
        {data.line1}
      </div>
      {data.line2 && (
        <div className="text-muted-foreground text-xs mt-0.5 whitespace-nowrap" title={data.line2}>
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
    "all" | "active" | "upcoming" | "ended" | "removed"
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

    // Group leases by unitId so "Your rentals" has 1 row per unit (current lease)
    const leasesByUnit = new Map<string, typeof leases>();
    for (const l of leases) {
      const list = leasesByUnit.get(l.unit.id) || [];
      list.push(l);
      leasesByUnit.set(l.unit.id, list);
    }

    const unitCurrentLeases: typeof leases = [];
    for (const unitLeases of Array.from(leasesByUnit.values())) {
      // Find current lease or newest
      const current = unitLeases.find((l) => !l.terminatedAt && (!l.endDate || new Date(l.endDate) > today) && new Date(l.startDate) <= today)
        || unitLeases.find((l) => !l.terminatedAt && new Date(l.startDate) > today)
        || unitLeases[0];
      if (current) {
        unitCurrentLeases.push(current);
      }
    }

    const processed = unitCurrentLeases.map((lease) => {
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

    // Active leases are running today (active)
    const activeRunning = processed.filter(
      (l) => l.leaseStatus === "active"
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

    for (const item of processed) {
      if (!activeRunning.some((l) => l.id === item.id)) continue;
      const rentAmount = Number(item.rentAmount) || 0;
      if (rentAmount <= 0 || !item.balance.nextDueDate) continue;

      if (formatLagosYMD(item.balance.nextDueDate) >= todayStr) {
        const due = new Date(item.balance.nextDueDate);
        if (!earliestDueDate || due < earliestDueDate) {
          earliestDueDate = due;
          earliestPayment = {
            amount: rentAmount,
            dateStr: formatDateGB(item.balance.nextDueDate),
            unitName: item.unit.unitNumber,
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
        // Current and upcoming and removed; ended and moved_out only when filter says Ended
        if (l.leaseStatus === "ended" || l.leaseStatus === "moved_out") {
          return false;
        }
      } else if (statusFilter === "active") {
        if (l.leaseStatus !== "active") return false;
      } else if (statusFilter === "upcoming") {
        if (l.leaseStatus !== "upcoming") return false;
      } else if (statusFilter === "ended") {
        if (l.leaseStatus !== "ended" && l.leaseStatus !== "moved_out") {
          return false;
        }
      } else if (statusFilter === "removed") {
        if (l.leaseStatus !== "removed") return false;
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
      <div className="min-h-screen bg-background text-foreground">
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
                className="rounded-xl border border-border bg-card p-[18px] min-h-[140px] flex flex-col justify-between"
              >
                <Skeleton className="w-10 h-10 rounded-xl" />
                <div className="space-y-1.5 mt-3.5">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-7 w-28" />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-10 w-full" />
            <div className="rounded-xl border border-border p-4 space-y-3">
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
    <div className="min-h-screen bg-background text-foreground">
      <PageHeader title="Home" />

      <PageContainer className="space-y-6">
        {/* Welcome Heading */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground font-sans">
            Welcome back, {firstName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your rentals, payments and documents in one place.
          </p>
        </div>

        {/* Pending invitations banner(s) slot directly under heading, ABOVE metric cards */}
        {pendingInvitations && pendingInvitations.length > 0 && (
          <div className="space-y-3">
            {pendingInvitations.map((inv) => {
              const landlordName = inv.unit.property.landlord.fullName || "Landlord";
              const rentText =
                Number(inv.rentAmount) > 0
                  ? `${formatCurrency(inv.rentAmount)} / ${formatRentFrequency(inv.rentFrequency)}`
                  : "Rent TBD";
              const periodText = `${formatDateGB(inv.startDate)} – ${inv.endDate ? formatDateGB(inv.endDate) : "Ongoing"}`;

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
                  className="rounded-xl border border-border bg-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                  <div className="space-y-1">
                    <h3 className="text-sm sm:text-base font-semibold text-foreground">
                      {landlordName} invited you to rent {inv.unit.unitNumber} at {inv.unit.property.name}
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {rentText} · {periodText}{expiryText ? ` · ${expiryText}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewingInvitation(inv)}
                      className="text-xs h-8 px-3 border-border hover:bg-muted text-foreground"
                    >
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeclineConfirmInvitation(inv)}
                      className="text-xs h-8 px-3 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => acceptInvitation.mutate({ leaseId: inv.id })}
                      disabled={acceptInvitation.isPending}
                      className="text-xs h-8 px-3 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
          {/* Card 1: Active leases (kpi-navy, Home) */}
          <div className="rounded-xl px-[18px] py-4 border border-transparent bg-kpi-navy-fill flex items-center gap-3.5 min-h-[96px]">
            <div className="w-10 h-10 rounded-xl bg-white/80 dark:bg-black/25 flex items-center justify-center shrink-0">
              <Home className="w-5 h-5 text-kpi-navy" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-muted-foreground leading-none">Active leases</span>
              <span
                className="text-xl xl:text-2xl font-bold tracking-tight tabular-nums text-foreground mt-0.5 block leading-tight whitespace-nowrap"
              >
                {activeLeasesCount}
              </span>
            </div>
          </div>

          {/* Card 2: Landlords (kpi-gold, Users) */}
          <div className="rounded-xl px-[18px] py-4 border border-transparent bg-kpi-gold-fill flex items-center gap-3.5 min-h-[96px]">
            <div className="w-10 h-10 rounded-xl bg-white/80 dark:bg-black/25 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-kpi-gold" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-muted-foreground leading-none">Landlords</span>
              <span
                className="text-xl xl:text-2xl font-bold tracking-tight tabular-nums text-foreground mt-0.5 block leading-tight whitespace-nowrap"
              >
                {distinctLandlordsCount}
              </span>
            </div>
          </div>

          {/* Card 3: Outstanding (kpi-clay, CreditCard) */}
          <div className="rounded-xl px-[18px] py-4 border border-transparent bg-kpi-clay-fill flex items-center gap-3.5 min-h-[96px]">
            <div className="w-10 h-10 rounded-xl bg-white/80 dark:bg-black/25 flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5 text-kpi-clay" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-muted-foreground leading-none">Outstanding</span>
              <span
                className={cn(
                  "text-xl xl:text-2xl font-bold tracking-tight tabular-nums mt-0.5 block leading-tight whitespace-nowrap",
                  totalOutstanding > 0 ? "text-destructive" : "text-foreground"
                )}
              >
                {totalOutstanding > 0 ? formatCurrency(totalOutstanding) : "₦0"}
              </span>
            </div>
          </div>

          {/* Card 4: Next payment (kpi-sage, Calendar) */}
          <div className="rounded-xl px-[18px] py-4 border border-transparent bg-kpi-sage-fill flex items-center gap-3.5 min-h-[96px]">
            <div className="w-10 h-10 rounded-xl bg-white/80 dark:bg-black/25 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5 text-kpi-sage" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-muted-foreground leading-none">Next payment</span>
              {nextPayment ? (
                <>
                  <span
                    className="text-xl xl:text-2xl font-bold tracking-tight tabular-nums text-foreground mt-0.5 block leading-tight whitespace-nowrap"
                  >
                    {formatCurrency(nextPayment.amount)}
                  </span>
                  <span
                    className="text-xs text-subtle-foreground mt-0.5 block truncate"
                    title={`${nextPayment.dateStr} · ${nextPayment.unitName}`}
                  >
                    {nextPayment.dateStr} · {nextPayment.unitName}
                  </span>
                </>
              ) : (
                <span className="text-xl xl:text-2xl font-bold tracking-tight tabular-nums text-subtle-foreground mt-0.5 block leading-tight whitespace-nowrap">
                  —
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Your rentals section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground font-sans">Your rentals</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-muted border border-border text-muted-foreground">
              {filteredRentals.length}
            </span>
          </div>

          {/* Toolbar: search 280px wide on left with Status filter right beside it */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative w-full sm:w-[280px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search property, unit or landlord"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 rounded-lg field-focus text-sm text-foreground placeholder:text-muted-foreground"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
                    e.target.value as "all" | "active" | "upcoming" | "ended" | "removed"
                  )
                }
                className="w-full h-9 text-xs"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="upcoming">Upcoming</option>
                <option value="ended">Ended</option>
                <option value="removed">Removed</option>
              </Select>
            </div>
          </div>

          {/* Desktop Table (>= 768px): fixed layout with colgroup, wrapped in overflow-x-auto */}
          <div className="hidden md:block rounded-xl border border-border bg-card overflow-x-auto">
            <table className="w-full min-w-[1100px] table-fixed divide-y divide-border text-left text-sm">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[10%]" />
                <col className="w-[19%]" />
                <col className="w-[13%]" />
                <col className="w-[16%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead className="border-b border-border bg-muted text-xs font-semibold text-subtle-foreground uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                    Property
                  </th>
                  <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                    Unit
                  </th>
                  <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                    Landlord
                  </th>
                  <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                    Rent
                  </th>
                  <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                    Lease period
                  </th>
                  <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                    Status
                  </th>
                  <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                    Next rent due
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRentals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center text-muted-foreground">
                      <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm font-medium text-foreground/80">No rentals yet.</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        When a landlord adds you to a unit, it shows up here.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredRentals.map((lease) => {
                    const isRemoved = lease.leaseStatus === "removed";
                    return (
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
                        className={cn(
                          "h-16 hover:bg-accent/50 transition-colors cursor-pointer group focus:outline-none focus:bg-accent/50",
                          isRemoved && "text-muted-foreground"
                        )}
                      >
                        {/* Property (20%) */}
                        <td className="px-5 py-3.5 min-w-0 overflow-hidden">
                          <div
                            className={cn(
                              "font-medium truncate",
                              isRemoved ? "text-muted-foreground" : "text-foreground group-hover:text-foreground/90"
                            )}
                            title={lease.unit.property.name}
                          >
                            {lease.unit.property.name}
                          </div>
                          {lease.unit.property.address && (
                            <div
                              className="text-xs text-muted-foreground truncate mt-0.5"
                              title={lease.unit.property.address}
                            >
                              {lease.unit.property.address}
                            </div>
                          )}
                        </td>

                        {/* Unit (10%) */}
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span
                            className={cn(
                              "text-sm font-medium whitespace-nowrap block",
                              isRemoved ? "text-muted-foreground" : "text-foreground/80"
                            )}
                          >
                            {lease.unit.unitNumber}
                          </span>
                        </td>

                        {/* Landlord (19%) */}
                        <td className="px-5 py-3.5 min-w-0 overflow-hidden">
                          <div
                            className={cn(
                              "text-sm font-medium truncate",
                              isRemoved ? "text-muted-foreground" : "text-foreground"
                            )}
                            title={lease.unit.property.landlord.fullName}
                          >
                            {lease.unit.property.landlord.fullName}
                          </div>
                          <div
                            className="text-xs text-muted-foreground truncate mt-0.5"
                            title={lease.unit.property.landlord.email}
                          >
                            {lease.unit.property.landlord.email}
                          </div>
                        </td>

                        {/* Rent (13%) */}
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span
                            className={cn(
                              "font-medium whitespace-nowrap block text-sm",
                              isRemoved ? "text-muted-foreground" : "text-foreground"
                            )}
                          >
                            {formatCurrency(lease.rentAmount)}
                            <span className="text-muted-foreground text-xs font-normal">
                              {" "}/ {formatRentFrequency(lease.rentFrequency)}
                            </span>
                          </span>
                        </td>

                        {/* Lease period (16%) */}
                        <td className="px-5 py-3.5 whitespace-nowrap text-xs">
                          <span
                            className={cn(
                              "whitespace-nowrap block",
                              isRemoved ? "text-muted-foreground" : "text-foreground/80"
                            )}
                          >
                            {formatDateGB(lease.startDate)} – {lease.endDate ? formatDateGB(lease.endDate) : "Ongoing"}
                          </span>
                        </td>

                        {/* Status (10%) */}
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <StatusBadge status={lease.leaseStatus} />
                        </td>

                        {/* Next rent due (12%) */}
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          {isRemoved ? (
                            <span className="text-muted-foreground text-sm">—</span>
                          ) : (
                            <TwoLineRentDue data={lease.rentDueLines} />
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards (< 768px) */}
          <div className="md:hidden space-y-3">
            {filteredRentals.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
                <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium text-foreground/80">No rentals yet.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  When a landlord adds you to a unit, it shows up here.
                </p>
              </div>
            ) : (
              filteredRentals.map((lease) => {
                const isRemoved = lease.leaseStatus === "removed";
                return (
                  <div
                    key={lease.id}
                    onClick={() => router.push(`/tenant/rentals/${lease.id}`)}
                    className={cn(
                      "rounded-xl border border-border bg-card hover:bg-accent/40 transition-colors p-4 space-y-3 cursor-pointer",
                      isRemoved && "text-muted-foreground"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div
                          className={cn(
                            "text-sm font-semibold truncate",
                            isRemoved ? "text-muted-foreground" : "text-foreground"
                          )}
                        >
                          {lease.unit.unitNumber} · {lease.unit.property.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {lease.unit.property.landlord.fullName}
                        </div>
                      </div>
                      <div className="shrink-0">
                        <StatusBadge status={lease.leaseStatus} />
                      </div>
                    </div>

                    <div className="text-xs text-foreground/80">
                      <span className={cn("font-medium", isRemoved ? "text-muted-foreground" : "text-foreground")}>
                        {formatCurrency(lease.rentAmount)}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}/ {formatRentFrequency(lease.rentFrequency)}
                      </span>
                      <span className="text-subtle-foreground mx-1.5">·</span>
                      <span className={cn(isRemoved && "text-muted-foreground")}>
                        {formatDateGB(lease.startDate)} – {lease.endDate ? formatDateGB(lease.endDate) : "Ongoing"}
                      </span>
                    </div>

                    <div className="pt-2.5 border-t border-border flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Next rent due</span>
                      {isRemoved ? (
                        <span className="text-muted-foreground text-sm">—</span>
                      ) : (
                        <TwoLineRentDue data={lease.rentDueLines} />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </PageContainer>

      {/* View Terms Dialog */}
      <Modal
        open={Boolean(viewingInvitation)}
        onOpenChange={(open) => !open && setViewingInvitation(null)}
        isSaving={acceptInvitation.isPending}
        size="md"
      >
        {viewingInvitation && (
          <>
            <ModalHeader
              title="Rental Invitation"
              onClose={() => setViewingInvitation(null)}
              isSaving={acceptInvitation.isPending}
            />
            <ModalBody className="space-y-4 text-sm divide-y divide-border">
              <div className="pt-1">
                <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Property</span>
                <span className="font-semibold text-foreground mt-1 block">{viewingInvitation.unit.property.name}</span>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {viewingInvitation.unit.property.address}, {viewingInvitation.unit.property.city}, {viewingInvitation.unit.property.state}
                </p>
              </div>

              <div className="pt-3">
                <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unit</span>
                <span className="font-semibold text-foreground mt-1 block">{viewingInvitation.unit.unitNumber}</span>
              </div>

              <div className="pt-3">
                <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Landlord</span>
                <span className="font-semibold text-foreground mt-1 block">
                  {viewingInvitation.unit.property.landlord.fullName || "Landlord"}
                </span>
                <p className="text-muted-foreground text-xs mt-0.5">{viewingInvitation.unit.property.landlord.email}</p>
              </div>

              <div className="pt-3">
                <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rental Period</span>
                <span className="font-semibold text-foreground mt-1 block">
                  {formatDateGB(viewingInvitation.startDate)} – {viewingInvitation.endDate ? formatDateGB(viewingInvitation.endDate) : "Ongoing"}
                </span>
              </div>

              <div className="pt-3">
                <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rent</span>
                <span className="font-semibold text-foreground mt-1 block">
                  {Number(viewingInvitation.rentAmount) > 0
                    ? `${formatCurrency(viewingInvitation.rentAmount)} / ${formatRentFrequency(viewingInvitation.rentFrequency)}`
                    : "TBD"}
                </span>
              </div>

              <div className="pt-3">
                <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deposit</span>
                <span className="font-semibold text-foreground mt-1 block">
                  {viewingInvitation.depositAmount ? formatCurrency(viewingInvitation.depositAmount) : "None"}
                </span>
              </div>
            </ModalBody>

            <ModalFooter
              cancelText="Decline"
              onCancel={() => setDeclineConfirmInvitation(viewingInvitation)}
              primaryText="Accept"
              onPrimary={() => acceptInvitation.mutate({ leaseId: viewingInvitation.id })}
              isSaving={acceptInvitation.isPending}
            />
          </>
        )}
      </Modal>

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
        loadingText="Declining..."
        variant="danger"
        isLoading={declineInvitation.isPending}
      />
    </div>
  );
}
