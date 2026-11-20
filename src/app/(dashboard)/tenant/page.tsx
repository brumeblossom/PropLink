'use client';

import { useMemo } from "react";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { getDueDateStatus } from "@/lib/billing";
import { getCurrentLease, getNextLease } from "@/lib/leases";
import { Home } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type LeaseElement = RouterOutputs["leases"]["getMine"][number];

export default function TenantDashboard() {
  const { data: user, isLoading: isLoadingUser } = trpc.auth.me.useQuery();
  const { data: leases, isLoading: isLoadingLeases } = trpc.leases.getMine.useQuery();

  const unitLeasePairs = useMemo(() => {
    if (!leases) return [];
    const map = new Map<string, typeof leases>();
    for (const l of leases) {
      const arr = map.get(l.unitId) || [];
      arr.push(l);
      map.set(l.unitId, arr);
    }
    const today = new Date();
    return Array.from(map.values()).map((unitLeases) => ({
      currentLease: getCurrentLease(unitLeases, today) || unitLeases[0],
      nextLease: getNextLease(unitLeases, today),
    }));
  }, [leases]);

  if (isLoadingUser || isLoadingLeases) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white">
        <PageHeader title="Dashboard" />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          {/* Welcome */}
          <div>
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-4 w-80 mt-2" />
          </div>

          {/* Lease Section Skeleton */}
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-4">
              <div className="flex items-center space-x-3">
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-4 w-40" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>

            {/* 3 Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 backdrop-blur-sm space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-3 w-40 mt-1" />
                </div>
              ))}
            </div>

            {/* Terms & Duration Card */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-6 backdrop-blur-sm space-y-4">
              <Skeleton className="h-6 w-40" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="space-y-1">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-5 w-32 mt-1" />
                  </div>
                ))}
              </div>
            </div>

            {/* Agreement Download Card */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-6 backdrop-blur-sm flex items-center justify-between">
              <div className="space-y-1">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="h-9 w-36 rounded-md" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <PageHeader title="Dashboard" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Welcome back, {user?.fullName || "Tenant"}
        </h1>
        <p className="text-neutral-400 mt-1 text-sm">
          Access your lease, rental terms, and landlord-uploaded documents.
        </p>
      </div>

      {unitLeasePairs.length > 0 ? (
        <div className="space-y-12">
          {unitLeasePairs.map(({ currentLease, nextLease }) => (
            <TenantLeaseSection key={currentLease.id} lease={currentLease} nextLease={nextLease} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-12 text-center max-w-xl mx-auto space-y-4">
          <div className="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center mx-auto">
            <Home className="w-8 h-8 text-neutral-600" />
          </div>
          <h3 className="text-lg font-medium text-white">No active lease found</h3>
          <p className="text-neutral-400 text-sm">
            Your account has successfully registered, but is not currently linked to an active
            tenancy. Please contact your landlord to request an invitation.
          </p>
        </div>
      )}
    </main>
  </div>
  );
}

function TenantLeaseSection({
  lease,
  nextLease,
}: {
  lease: LeaseElement;
  nextLease?: LeaseElement | null;
}) {
  const utils = trpc.useUtils();
  const { toast } = useToast();

  const { data: billingSummary } = trpc.payments.getBillingSummary.useQuery(
    { leaseId: lease.id },
    { enabled: !!lease.id }
  );

  const handleDownloadAgreement = async (leaseId: string) => {
    try {
      const { signedUrl } = await utils.client.leases.getDocumentUrl.query({ leaseId });
      window.open(signedUrl, "_blank");
    } catch {
      toast("Could not open lease document", "error");
    }
  };

  // Compute lease status for display badge
  let leaseStatus: "active" | "renewal_due" | "expired" | "upcoming" | "terminated" = "active";
  let isRenewalDue = false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(lease.startDate);
  const end = new Date(lease.endDate);

  if (lease.terminatedAt) {
    leaseStatus = "terminated";
  } else if (today < start) {
    leaseStatus = "upcoming";
  } else if (today > end) {
    leaseStatus = "expired";
  } else {
    const renewalStartDate = new Date(end);
    renewalStartDate.setDate(renewalStartDate.getDate() - lease.renewalWindowDays);
    if (today >= renewalStartDate) {
      leaseStatus = nextLease ? "active" : "renewal_due";
      isRenewalDue = !nextLease;
    } else {
      leaseStatus = "active";
    }
  }

  return (
    <div className="space-y-6 border border-neutral-800 bg-neutral-900/5 p-6 rounded-2xl">
      {/* Lease Summary + Document Wallet */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Lease Summary Card */}
        <div className="lg:col-span-2 rounded-xl border border-neutral-800 bg-neutral-900/10 p-6 backdrop-blur-sm space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  {lease.unit.property.name}
                </h2>
                <p className="text-neutral-400 text-sm mt-0.5">
                  {lease.unit.property.address}, {lease.unit.property.city},{" "}
                  {lease.unit.property.state}
                </p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold capitalize border ${
                  leaseStatus === "renewal_due"
                    ? "bg-yellow-950/30 text-yellow-400 border-yellow-900/30 animate-pulse"
                    : leaseStatus === "active"
                    ? "bg-green-950/30 text-green-400 border-green-900/30"
                    : "bg-neutral-900 text-neutral-400 border-neutral-800"
                }`}
              >
                Lease: {leaseStatus.replace("_", " ")}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 pt-4 border-t border-neutral-950/50">
              <div>
                <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  Unit
                </span>
                <span className="font-bold text-white text-lg block mt-0.5">
                  Unit {lease.unit.unitNumber}
                </span>
                <span className="text-neutral-400 text-xs capitalize block mt-0.5">
                  {lease.unit.unitType}
                </span>
              </div>

              <div>
                <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  Rent Rate
                </span>
                <span className="font-bold text-white text-lg block mt-0.5">
                  {formatCurrency(lease.rentAmount)}
                </span>
                <span className="text-neutral-400 text-xs capitalize block mt-0.5">
                  Per {lease.rentFrequency}
                </span>
              </div>

              <div>
                <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  Security Deposit
                </span>
                <span className="font-bold text-white text-lg block mt-0.5">
                  {lease.depositAmount ? formatCurrency(lease.depositAmount) : "—"}
                </span>
                <span className="text-neutral-400 text-xs block mt-0.5">Paid/Secured</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-neutral-950/50 text-sm">
              <div>
                <span className="block text-neutral-500 text-xs font-medium">Start Date</span>
                <span className="font-semibold text-white block mt-0.5">
                  {new Date(lease.startDate).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
              <div>
                <span className="block text-neutral-500 text-xs font-medium">End Date</span>
                <span className="font-semibold text-white block mt-0.5">
                  {new Date(lease.endDate).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
            </div>

            {nextLease ? (
              <div className="rounded-lg bg-blue-950/20 border border-blue-900/30 p-3 mt-4 text-xs text-blue-400 flex items-start space-x-2.5">
                <span className="text-sm leading-none font-bold mt-0.5">✓</span>
                <div>
                  <p className="font-semibold">Renewal Confirmed</p>
                  <p className="mt-0.5 opacity-90">
                    Your renewal lease ({new Date(nextLease.startDate).toLocaleDateString()} –{" "}
                    {new Date(nextLease.endDate).toLocaleDateString()}) is scheduled.
                  </p>
                </div>
              </div>
            ) : isRenewalDue ? (
              <div className="rounded-lg bg-yellow-950/20 border border-yellow-900/30 p-3 mt-4 text-xs text-yellow-400 flex items-start space-x-2.5">
                <span className="text-sm leading-none font-bold mt-0.5">⚠️</span>
                <div>
                  <p className="font-semibold">Renewal Pending</p>
                  <p className="mt-0.5 opacity-90">
                    Your lease agreement ends on{" "}
                    {new Date(lease.endDate).toLocaleDateString()}. Please contact your
                    landlord to process your lease renewal.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Document Wallet */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-6 flex flex-col justify-between space-y-6">
          <div>
            <h3 className="font-bold text-white text-lg">Documents Wallet</h3>
            <p className="text-neutral-500 text-xs mt-1">
              Access your official lease documents.
            </p>

            {lease.documentUrl ? (
              <div className="mt-4 p-3 rounded-lg border border-neutral-800 bg-neutral-900/40 flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-300 truncate max-w-[150px]">
                  Lease_Agreement.pdf
                </span>
                <Button
                  onClick={() => handleDownloadAgreement(lease.id)}
                  variant="outline"
                  className="border-neutral-800 text-xs h-7 px-2.5 text-white hover:bg-neutral-900 transition-colors"
                >
                  Download PDF
                </Button>
              </div>
            ) : (
              <p className="text-sm text-neutral-500 mt-6 italic text-center">
                Your landlord has not uploaded a copy of the lease agreement yet.
              </p>
            )}
          </div>

          <div className="pt-4 border-t border-neutral-800/40 text-xs text-neutral-500 leading-normal">
            Need support with payments or maintenance? Landlord details and contact operations
            will be enabled in future releases.
          </div>
        </div>
      </div>

      {/* Mini Billing Summary */}
      {billingSummary && (() => {
        return (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold tracking-tight">Billing Summary</h2>
              <a
                href="/tenant/payments"
                className="text-xs text-neutral-400 hover:text-white transition-colors font-medium"
              >
                View full ledger →
              </a>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    Rent due so far
                  </span>
                  <span className="text-lg font-bold text-white block">
                    {!billingSummary.isRentSet ? "Rent not set" : formatCurrency(billingSummary.rentDueToDate)}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    Paid (confirmed)
                  </span>
                  <span className="text-lg font-bold text-white block">
                    {!billingSummary.isRentSet ? "Rent not set" : formatCurrency(billingSummary.paidToDate)}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    Outstanding Balance
                  </span>
                  {!billingSummary.isRentSet ? (
                    <span className="text-lg font-bold text-neutral-400 block">Rent not set</span>
                  ) : billingSummary.credit > 0 ? (
                    <span className="text-lg font-bold text-green-400 block">
                      Credit {formatCurrency(billingSummary.credit)}
                    </span>
                  ) : billingSummary.outstanding > 0 ? (
                    <span className="text-lg font-bold text-red-400 block">
                      {formatCurrency(billingSummary.outstanding)}
                    </span>
                  ) : (
                    <span className="text-lg font-bold text-green-400 block">₦0</span>
                  )}
                </div>
              </div>
              {billingSummary.isRentSet && (() => {
                const status = getDueDateStatus(
                  billingSummary.nextDueDate,
                  lease.endDate,
                  new Date(),
                  billingSummary.unpaidPeriods
                );
                const statusColor =
                  status.status === "overdue"
                    ? "text-red-400 font-medium"
                    : status.status === "today"
                    ? "text-amber-400 font-medium"
                    : status.status === "paid_in_full"
                    ? "text-green-400 font-medium"
                    : "text-neutral-300";

                return (
                  <div className="pt-3 border-t border-neutral-800/60 text-sm text-neutral-300">
                    <span className={statusColor}>{status.text}</span>
                    {billingSummary.pendingAmount > 0 && (
                      <span className="text-amber-400 font-medium">
                        {" • "}
                        {formatCurrency(billingSummary.pendingAmount)} waiting for landlord confirmation
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
