'use client';

import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { Home } from "lucide-react";

export default function TenantDashboard() {
  const utils = trpc.useUtils();

  const { data: user, isLoading: isLoadingUser } = trpc.auth.me.useQuery();
  const { data: leases, isLoading: isLoadingLeases } = trpc.leases.getMine.useQuery();
  const activeLease = leases?.find((l) => !l.terminatedAt);

  const { data: billingSummary } = trpc.payments.getBillingSummary.useQuery(
    { leaseId: activeLease?.id || "" },
    { enabled: !!activeLease?.id }
  );

  const handleDownloadAgreement = async (leaseId: string) => {
    try {
      const { signedUrl } = await utils.client.leases.getDocumentUrl.query({ leaseId });
      window.open(signedUrl, "_blank");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch document download link.";
      alert(message);
    }
  };

  if (isLoadingUser || isLoadingLeases) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-neutral-500 text-sm animate-pulse">Loading lease details...</p>
      </div>
    );
  }

  // Compute lease status for display badge
  let leaseStatus: "active" | "renewal_due" | "expired" | "upcoming" | "terminated" = "active";
  let isRenewalDue = false;

  if (activeLease) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(activeLease.startDate);
    const end = new Date(activeLease.endDate);

    if (activeLease.terminatedAt) {
      leaseStatus = "terminated";
    } else if (today < start) {
      leaseStatus = "upcoming";
    } else if (today > end) {
      leaseStatus = "expired";
    } else {
      const renewalStartDate = new Date(end);
      renewalStartDate.setDate(renewalStartDate.getDate() - activeLease.renewalWindowDays);
      if (today >= renewalStartDate) {
        leaseStatus = "renewal_due";
        isRenewalDue = true;
      } else {
        leaseStatus = "active";
      }
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Welcome back, {user?.fullName || "Tenant"}
        </h1>
        <p className="text-neutral-400 mt-1 text-sm">
          Access your active lease, rental terms, and landlord-uploaded documents.
        </p>
      </div>

      {activeLease ? (
        <>
          {/* Lease Summary + Document Wallet */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Lease Summary Card */}
            <div className="lg:col-span-2 rounded-xl border border-neutral-800 bg-neutral-900/10 p-6 backdrop-blur-sm space-y-6 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">
                      {activeLease.unit.property.name}
                    </h2>
                    <p className="text-neutral-400 text-sm mt-0.5">
                      {activeLease.unit.property.address}, {activeLease.unit.property.city},{" "}
                      {activeLease.unit.property.state}
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
                      Unit {activeLease.unit.unitNumber}
                    </span>
                    <span className="text-neutral-400 text-xs capitalize block mt-0.5">
                      {activeLease.unit.unitType}
                    </span>
                  </div>

                  <div>
                    <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                      Rent Rate
                    </span>
                    <span className="font-bold text-white text-lg block mt-0.5">
                      {formatCurrency(activeLease.rentAmount)}
                    </span>
                    <span className="text-neutral-400 text-xs capitalize block mt-0.5">
                      Per {activeLease.rentFrequency}
                    </span>
                  </div>

                  <div>
                    <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                      Security Deposit
                    </span>
                    <span className="font-bold text-white text-lg block mt-0.5">
                      {activeLease.depositAmount ? formatCurrency(activeLease.depositAmount) : "—"}
                    </span>
                    <span className="text-neutral-400 text-xs block mt-0.5">Paid/Secured</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-neutral-950/50 text-sm">
                  <div>
                    <span className="block text-neutral-500 text-xs font-medium">Start Date</span>
                    <span className="font-semibold text-white block mt-0.5">
                      {new Date(activeLease.startDate).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="block text-neutral-500 text-xs font-medium">End Date</span>
                    <span className="font-semibold text-white block mt-0.5">
                      {new Date(activeLease.endDate).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                </div>

                {isRenewalDue && (
                  <div className="rounded-lg bg-yellow-950/20 border border-yellow-900/30 p-3 mt-4 text-xs text-yellow-400 flex items-start space-x-2.5">
                    <span className="text-sm leading-none font-bold mt-0.5">⚠️</span>
                    <div>
                      <p className="font-semibold">Renewal Pending</p>
                      <p className="mt-0.5 opacity-90">
                        Your lease agreement ends on{" "}
                        {new Date(activeLease.endDate).toLocaleDateString()}. Please contact your
                        landlord to process your lease renewal.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Document Wallet */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-6 flex flex-col justify-between space-y-6">
              <div>
                <h3 className="font-bold text-white text-lg">Documents Wallet</h3>
                <p className="text-neutral-500 text-xs mt-1">
                  Access your official lease documents.
                </p>

                {activeLease.documentUrl ? (
                  <div className="mt-4 p-3 rounded-lg border border-neutral-800 bg-neutral-900/40 flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-300 truncate max-w-[150px]">
                      Lease_Agreement.pdf
                    </span>
                    <Button
                      onClick={() => handleDownloadAgreement(activeLease.id)}
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
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dueDate = new Date(billingSummary.periodEnd);
            const isNearDue =
              dueDate.getTime() - today.getTime() <= 7 * 24 * 60 * 60 * 1000 &&
              dueDate.getTime() - today.getTime() >= 0;
            const isOverdue = today > dueDate && billingSummary.amountOutstanding > 0;

            return (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-bold tracking-tight">Current Period</h2>
                  <a
                    href="/tenant/payments"
                    className="text-xs text-neutral-400 hover:text-white transition-colors font-medium"
                  >
                    View full ledger →
                  </a>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl border border-neutral-800 bg-neutral-900/10 p-5">
                  <div className="space-y-1">
                    <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                      Next Rent Due Date
                    </span>
                    <span
                      className={`text-sm font-semibold block ${
                        isOverdue
                          ? "text-red-400"
                          : isNearDue
                          ? "text-yellow-400 animate-pulse"
                          : "text-neutral-300"
                      }`}
                    >
                      {dueDate.toLocaleDateString(undefined, {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                      {isOverdue && " (Overdue)"}
                      {isNearDue && " (Due soon)"}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                      Rent / Confirmed Paid
                    </span>
                    <span className="text-lg font-bold text-white block">
                      {formatCurrency(billingSummary.rentAmount)}{" "}
                      <span className="text-neutral-500 font-normal text-sm">
                        / {formatCurrency(billingSummary.amountPaid)} paid
                      </span>
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                      Outstanding Balance
                    </span>
                    <span
                      className={`text-lg font-bold block ${
                        billingSummary.amountOutstanding > 0 ? "text-red-400" : "text-green-400"
                      }`}
                    >
                      {formatCurrency(billingSummary.amountOutstanding)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
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
  );
}
