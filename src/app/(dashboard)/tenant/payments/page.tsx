'use client';

import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { Select } from "@/components/ui/select";
import { PaymentMethod } from "@prisma/client";
import { X, CreditCard, ChevronLeft, Building2, Home, Plus, Check, AlertTriangle, Pencil, FileText, MoreHorizontal } from "lucide-react";
import { formatCurrency, formatInputNumber } from "@/lib/utils";
import { getDueDateStatus } from "@/lib/billing";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type LeaseItem = RouterOutputs["leases"]["getMine"][number];

const paymentStatusLabel: Record<string, string> = {
  confirmed: "Confirmed",
  pending: "Pending",
  disputed: "Rejected",
};

// ─── Lease status computation (same logic as dashboard) ──────────────────────
function getLeaseStatus(lease: LeaseItem): "active" | "renewal_due" | "expired" | "upcoming" | "terminated" {
  if (lease.terminatedAt) return "terminated";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(lease.startDate);
  const end = new Date(lease.endDate);
  if (today < start) return "upcoming";
  if (today > end) return "expired";
  const renewalStart = new Date(end);
  renewalStart.setDate(renewalStart.getDate() - lease.renewalWindowDays);
  return today >= renewalStart ? "renewal_due" : "active";
}

// ─── Lease Selector ────────────────────────────────────────────────────────────
function LeaseSelector({ leases, onSelect }: { leases: LeaseItem[]; onSelect: (id: string) => void }) {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <PageHeader title="Payments" />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing &amp; Payments</h1>
          <p className="text-neutral-400 text-sm mt-1">
            You have multiple leases. Select a lease to view its payment ledger.
          </p>
        </div>

        <div className="space-y-3">
          {leases.map((lease) => {
            const status = getLeaseStatus(lease);
            return (
              <button
                key={lease.id}
                onClick={() => onSelect(lease.id)}
                className="w-full text-left rounded-xl border border-neutral-800 bg-neutral-900/10 hover:bg-neutral-900/30 hover:border-neutral-700 transition-all p-5 group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg border border-neutral-800 bg-neutral-900 flex items-center justify-center shrink-0 group-hover:border-neutral-700 transition-colors">
                      <Building2 className="w-5 h-5 text-neutral-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-white leading-tight">
                        {lease.unit.property.name}
                      </p>
                      <p className="text-neutral-400 text-xs mt-0.5">
                        Unit {lease.unit.unitNumber} · {lease.unit.property.address}, {lease.unit.property.city}
                      </p>
                      <p className="text-neutral-400 text-xs mt-1">
                        {formatCurrency(lease.rentAmount)}/{lease.rentFrequency} ·{" "}
                        {new Date(lease.startDate).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                        {" – "}
                        {new Date(lease.endDate).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                      status === "renewal_due"
                        ? "bg-yellow-950/30 text-yellow-400 border-yellow-900/30"
                        : status === "active"
                        ? "bg-green-950/30 text-green-400 border-green-900/30"
                        : "bg-neutral-900 text-neutral-400 border-neutral-800"
                    }`}
                  >
                    {status.replace("_", " ")}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}

// ─── Payment Ledger (scoped to a single lease) ────────────────────────────────
function LeasePaymentLedger({
  lease,
  showBackButton,
  onBack,
}: {
  lease: LeaseItem;
  showBackButton: boolean;
  onBack: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: user } = trpc.auth.me.useQuery();

  const { data: payments, isLoading: isLoadingPayments } = trpc.payments.list.useQuery(
    { leaseId: lease.id },
    { refetchInterval: 30_000 }
  );

  const { data: billingSummary } = trpc.payments.getBillingSummary.useQuery(
    { leaseId: lease.id }
  );

  // Mutations – all scoped to this specific lease.id
  const createPayment = trpc.payments.create.useMutation({
    onSuccess: () => {
      utils.payments.list.invalidate({ leaseId: lease.id });
      utils.payments.getBillingSummary.invalidate({ leaseId: lease.id });
      setIsLogPaymentOpen(false);
      resetPaymentForm();
    },
    onError: (err) => setPaymentError(err.message),
  });

  const updatePendingPayment = trpc.payments.updatePending.useMutation({
    onSuccess: () => {
      utils.payments.list.invalidate({ leaseId: lease.id });
      utils.payments.getBillingSummary.invalidate({ leaseId: lease.id });
      setIsLogPaymentOpen(false);
      resetPaymentForm();
    },
    onError: (err) => setPaymentError(err.message),
  });

  const getUploadUrlMutation = trpc.payments.getUploadUrl.useMutation();

  const acknowledgePayment = trpc.payments.acknowledge.useMutation({
    onSuccess: () => utils.payments.list.invalidate({ leaseId: lease.id }),
    onError: (err) => alert(err.message),
  });

  const flagPayment = trpc.payments.flag.useMutation({
    onSuccess: () => {
      utils.payments.list.invalidate({ leaseId: lease.id });
      setIsFlagOpen(false);
      setFlagReason("");
      setFlagPaymentId("");
    },
    onError: (err) => alert(err.message),
  });

  const { toast } = useToast();
  const [isDeleteProofConfirmOpen, setIsDeleteProofConfirmOpen] = useState(false);
  const [uploadingDetailProof, setUploadingDetailProof] = useState(false);

  const deleteProofMutation = trpc.payments.deleteProof.useMutation({
    onSuccess: () => {
      toast("Payment proof removed", "success");
      utils.payments.list.invalidate({ leaseId: lease.id });
      if (selectedPayment) {
        setSelectedPayment({
          ...selectedPayment,
          proofUrl: null,
        });
      }
      setIsDeleteProofConfirmOpen(false);
    },
    onError: (err) => {
      toast(err.message, "error");
    },
  });

  const attachProofMutation = trpc.payments.attachProof.useMutation({
    onSuccess: (_, vars) => {
      toast("Proof uploaded successfully", "success");
      utils.payments.list.invalidate({ leaseId: lease.id });
      if (selectedPayment) {
        setSelectedPayment({
          ...selectedPayment,
          proofUrl: vars.proofUrl,
        });
      }
    },
    onError: (err) => {
      toast(err.message, "error");
    },
  });

  // Form states
  const [isLogPaymentOpen, setIsLogPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.cash);
  const [paymentNotes, setPaymentNotes] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);

  // Flag/Dispute state
  const [isFlagOpen, setIsFlagOpen] = useState(false);
  const [flagPaymentId, setFlagPaymentId] = useState("");
  const [flagReason, setFlagReason] = useState("");

  // Payment details modal
  const [selectedPayment, setSelectedPayment] = useState<NonNullable<typeof payments>[number] | null>(null);
  const [isPaymentDetailsOpen, setIsPaymentDetailsOpen] = useState(false);
  const [openPaymentMenuId, setOpenPaymentMenuId] = useState<string | null>(null);

  // Year filter
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const resetPaymentForm = () => {
    setPaymentAmount("");
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentMethod(PaymentMethod.cash);
    setPaymentNotes("");
    setProofUrl(null);
    setUploadError(null);
    setPaymentError(null);
    setEditingPaymentId(null);
  };

  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    if (!payments || payments.length === 0) return [currentYear];
    const years = new Set(payments.map((p) => new Date(p.paymentDate).getFullYear()));
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [payments]);

  const filteredPayments = useMemo(() => {
    if (!payments) return [];
    return payments.filter((p) => new Date(p.paymentDate).getFullYear() === selectedYear);
  }, [payments, selectedYear]);

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);

    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File size exceeds 10MB limit.");
      return;
    }

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setUploadError("Only PDF and image files are allowed.");
      return;
    }

    setUploadingProof(true);
    try {
      const { signedUrl, path } = await getUploadUrlMutation.mutateAsync({
        leaseId: lease.id,
        fileName: file.name,
      });

      const response = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!response.ok) throw new Error("Failed to upload file to storage.");
      setProofUrl(path);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to upload proof document.";
      setUploadError(message);
    } finally {
      setUploadingProof(false);
    }
  };

  const handleLogPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError(null);

    const amount = parseFloat(paymentAmount.replace(/,/g, ""));
    if (isNaN(amount) || amount <= 0) {
      setPaymentError("Amount must be a positive number.");
      return;
    }

    if (billingSummary && billingSummary.isRentSet) {
      let maxAllowed = billingSummary.remainingLeaseRent;
      if (editingPaymentId && payments) {
        const cur = payments.find((p) => p.id === editingPaymentId);
        if (cur) {
          maxAllowed += Number(cur.amount);
        }
      }
      if (amount > maxAllowed) {
        setPaymentError(`This is more than the ${formatCurrency(maxAllowed)} left on this lease.`);
        return;
      }
    }

    try {
      if (editingPaymentId) {
        await updatePendingPayment.mutateAsync({
          paymentId: editingPaymentId,
          amount,
          paymentDate: new Date(paymentDate).toISOString(),
          method: paymentMethod,
          notes: paymentNotes || undefined,
          proofUrl: proofUrl || undefined,
        });
      } else {
        await createPayment.mutateAsync({
          leaseId: lease.id, // Always scoped to the selected lease
          amount,
          paymentDate: new Date(paymentDate).toISOString(),
          method: paymentMethod,
          notes: paymentNotes || undefined,
          proofUrl: proofUrl || undefined,
        });
      }
    } catch {
      // Errors handled by mutation onError callbacks
    }
  };

  const handleViewPaymentProof = async (path: string) => {
    try {
      const { signedUrl } = await utils.client.payments.getDownloadUrl.query({ path });
      window.open(signedUrl, "_blank");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch proof file URL.";
      alert(message);
    }
  };

  const handleDetailProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPayment) return;

    if (file.size > 10 * 1024 * 1024) {
      toast("File size exceeds 10MB limit.", "error");
      e.target.value = "";
      return;
    }

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast("Only PDF and image files are allowed.", "error");
      e.target.value = "";
      return;
    }

    try {
      setUploadingDetailProof(true);
      const { signedUrl, path } = await utils.client.payments.getUploadUrl.mutate({
        leaseId: lease.id,
        fileName: file.name,
      });

      const response = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!response.ok) {
        throw new Error("Failed to upload proof to storage.");
      }

      await attachProofMutation.mutateAsync({
        paymentId: selectedPayment.id,
        proofUrl: path,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to upload proof.";
      toast(message, "error");
    } finally {
      setUploadingDetailProof(false);
      e.target.value = "";
    }
  };

  const leaseStatus = getLeaseStatus(lease);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <PageHeader title="Payments" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            {showBackButton && (
              <button
                onClick={onBack}
                className="mt-1 text-neutral-400 hover:text-white transition-colors shrink-0"
                title="Back to lease selector"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Payment history</h1>
              <p className="text-neutral-400 text-sm mt-0.5 flex items-center gap-1.5">
                <Home className="w-3.5 h-3.5 shrink-0" />
                {lease.unit.property.name} · Unit {lease.unit.unitNumber}
                <span
                  className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                    leaseStatus === "active"
                      ? "bg-green-950/30 text-green-400 border-green-900/30"
                      : leaseStatus === "renewal_due"
                      ? "bg-yellow-950/30 text-yellow-400 border-yellow-900/30"
                      : "bg-neutral-900 text-neutral-400 border-neutral-800"
                  }`}
                >
                  {leaseStatus.replace("_", " ")}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            {/* Year filter */}
            <Select
              id="tenant-ledger-year-filter"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="h-9 w-28 text-sm"
              aria-label="Filter payment history by year"
            >
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </Select>
            {(() => {
              const isPaidInFull = Boolean(billingSummary && billingSummary.isRentSet && billingSummary.remainingLeaseRent <= 0);
              return (
                <div className={`relative inline-block ${isPaidInFull ? "cursor-not-allowed group" : ""}`}>
                  <Button
                    onClick={() => {
                      setIsLogPaymentOpen(true);
                      setPaymentAmount(
                        billingSummary?.outstanding
                          ? formatInputNumber(String(Math.min(billingSummary.outstanding, billingSummary.remainingLeaseRent)))
                          : ""
                      );
                      setPaymentError(null);
                    }}
                    disabled={isPaidInFull}
                    className="bg-white text-neutral-950 hover:bg-neutral-200 font-semibold disabled:opacity-50 disabled:pointer-events-none flex items-center"
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    Add Payment
                  </Button>
                  {isPaidInFull && (
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 whitespace-nowrap rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs font-medium text-neutral-200 shadow-xl"
                    >
                      This lease is fully paid.
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
      </div>

      {/* Billing Summary Banner */}
      {billingSummary && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Rent due so far
              </span>
              <span className="text-lg font-bold text-white block">
                {!billingSummary.isRentSet ? "Rent not set" : formatCurrency(billingSummary.rentDueToDate)}
              </span>
              {billingSummary.isRentSet && (
                <span className="block text-xs text-neutral-400">
                  {billingSummary.periodsDue} {billingSummary.periodsDue === 1 ? "period" : "periods"} since {new Date(lease.startDate).toLocaleDateString("en-GB")}
                </span>
              )}
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
                Outstanding
              </span>
              {!billingSummary.isRentSet ? (
                <span className="text-lg font-bold text-neutral-400 block">Rent not set</span>
              ) : billingSummary.credit > 0 ? (
                <span className="text-lg font-bold text-green-400 block">Credit {formatCurrency(billingSummary.credit)}</span>
              ) : billingSummary.outstanding > 0 ? (
                <span className="text-lg font-bold text-red-400 block">{formatCurrency(billingSummary.outstanding)}</span>
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
      )}

      {/* Payment Ledger Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/20">
        <table className="min-w-full divide-y divide-neutral-800">
          <thead className="bg-neutral-900/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                Date Logged
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                Method
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/60">
            {isLoadingPayments ? (
              [...Array(3)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4"><Skeleton className="h-4 w-20" /></td>
                  <td className="px-6 py-4"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-6 py-4"><Skeleton className="h-4 w-16" /></td>
                  <td className="px-6 py-4"><Skeleton className="h-5 w-20 rounded-full" /></td>
                  <td className="px-6 py-4 text-center"><Skeleton className="h-8 w-8 rounded-lg mx-auto" /></td>
                </tr>
              ))
            ) : filteredPayments.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-neutral-500 italic">
                  {!payments || payments.length === 0
                    ? "No payments logged yet."
                    : `No payments recorded for ${selectedYear}.`}
                </td>
              </tr>
            ) : (
              filteredPayments.map((p) => {
                const isLandlordLogged = p.recordedByRole === "landlord";
                return (
                  <tr
                    key={p.id}
                    onClick={() => { setSelectedPayment(p); setIsPaymentDetailsOpen(true); }}
                    className="hover:bg-neutral-900/20 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 text-sm text-neutral-300">
                      {new Date(p.paymentDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-white">
                      {formatCurrency(p.amount)}
                    </td>
                    <td className="px-6 py-4 text-sm text-neutral-400 capitalize">
                      {p.method.replace("_", " ")}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex flex-col space-y-1">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border w-fit ${
                              p.status === "confirmed"
                                ? "bg-green-950/30 text-green-400 border-green-900/30"
                                : p.status === "disputed"
                                ? "bg-red-950/30 text-red-400 border-red-900/30"
                                : "bg-yellow-950/30 text-yellow-400 border-yellow-900/30"
                            }`}
                          >
                            {paymentStatusLabel[p.status] ?? p.status}
                          </span>
                          {p.disputedByTenant && !p.disputedByResolvedAt && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-950/40 text-rose-400 border border-rose-900/50">
                              Flagged
                            </span>
                          )}
                        </div>
                        {p.counterVerifiedAt && (
                          <span className="text-[11px] text-green-500 font-medium">✓ You Acknowledged</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center">
                        <div className="relative group/action-btn">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenPaymentMenuId(openPaymentMenuId === p.id ? null : p.id);
                            }}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                            aria-label="Payment actions"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>

                          {/* Button tooltip when menu closed */}
                          {openPaymentMenuId !== p.id && (
                            <div
                              role="tooltip"
                              className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/action-btn:block z-50 whitespace-nowrap rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-neutral-300 shadow-xl"
                            >
                              Actions
                            </div>
                          )}

                          {/* Menu dropdown, right-aligned to the icon */}
                          {openPaymentMenuId === p.id && (
                            <>
                              <div
                                className="fixed inset-0 z-30"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenPaymentMenuId(null);
                                }}
                              />
                              <div className="absolute right-0 mt-1 w-44 rounded-xl border border-neutral-800 bg-neutral-950 p-1 shadow-2xl z-40 animate-in fade-in-0 zoom-in-95 duration-100 text-left">
                                {isLandlordLogged ? (
                                  <>
                                    {/* Acknowledge */}
                                    {p.counterVerifiedAt ? (
                                      <div className="relative group/tip w-full">
                                        <button
                                          type="button"
                                          disabled
                                          className="w-full px-3 py-2 text-left text-xs rounded-lg text-neutral-600 cursor-not-allowed flex items-center space-x-2"
                                        >
                                          <Check className="w-3.5 h-3.5 text-neutral-600" />
                                          <span>Acknowledge</span>
                                        </button>
                                        <div
                                          role="tooltip"
                                          className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/tip:block z-50 whitespace-nowrap rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-neutral-300 shadow-xl"
                                        >
                                          Already acknowledged
                                        </div>
                                      </div>
                                    ) : p.disputedByTenant && !p.disputedByResolvedAt ? (
                                      <div className="relative group/tip w-full">
                                        <button
                                          type="button"
                                          disabled
                                          className="w-full px-3 py-2 text-left text-xs rounded-lg text-neutral-600 cursor-not-allowed flex items-center space-x-2"
                                        >
                                          <Check className="w-3.5 h-3.5 text-neutral-600" />
                                          <span>Acknowledge</span>
                                        </button>
                                        <div
                                          role="tooltip"
                                          className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/tip:block z-50 whitespace-nowrap rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-neutral-300 shadow-xl"
                                        >
                                          Already flagged
                                        </div>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenPaymentMenuId(null);
                                          acknowledgePayment.mutate({ paymentId: p.id });
                                        }}
                                        disabled={acknowledgePayment.isPending}
                                        className="w-full px-3 py-2 text-left text-xs rounded-lg text-neutral-300 hover:bg-neutral-900 hover:text-white flex items-center space-x-2 transition-colors"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                        <span>Acknowledge</span>
                                      </button>
                                    )}

                                    {/* Flag incorrect */}
                                    {p.disputedByTenant && !p.disputedByResolvedAt ? (
                                      <div className="relative group/tip w-full">
                                        <button
                                          type="button"
                                          disabled
                                          className="w-full px-3 py-2 text-left text-xs rounded-lg text-neutral-600 cursor-not-allowed flex items-center space-x-2"
                                        >
                                          <AlertTriangle className="w-3.5 h-3.5 text-neutral-600" />
                                          <span>Flag incorrect</span>
                                        </button>
                                        <div
                                          role="tooltip"
                                          className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/tip:block z-50 whitespace-nowrap rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-neutral-300 shadow-xl"
                                        >
                                          Already flagged
                                        </div>
                                      </div>
                                    ) : p.counterVerifiedAt ? (
                                      <div className="relative group/tip w-full">
                                        <button
                                          type="button"
                                          disabled
                                          className="w-full px-3 py-2 text-left text-xs rounded-lg text-neutral-600 cursor-not-allowed flex items-center space-x-2"
                                        >
                                          <AlertTriangle className="w-3.5 h-3.5 text-neutral-600" />
                                          <span>Flag incorrect</span>
                                        </button>
                                        <div
                                          role="tooltip"
                                          className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/tip:block z-50 whitespace-nowrap rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-neutral-300 shadow-xl"
                                        >
                                          Already acknowledged
                                        </div>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenPaymentMenuId(null);
                                          setFlagPaymentId(p.id);
                                          setFlagReason("");
                                          setIsFlagOpen(true);
                                        }}
                                        className="w-full px-3 py-2 text-left text-xs rounded-lg text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 flex items-center space-x-2 transition-colors"
                                      >
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        <span>Flag incorrect</span>
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {/* Tenant's own entry */}
                                    {p.recordedBy === user?.id && (
                                      p.status === "pending" ? (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenPaymentMenuId(null);
                                            setEditingPaymentId(p.id);
                                            setPaymentAmount(formatInputNumber(String(p.amount)));
                                            setPaymentDate(new Date(p.paymentDate).toISOString().split("T")[0]);
                                            setPaymentMethod(p.method);
                                            setPaymentNotes(p.notes || "");
                                            setProofUrl(p.proofUrl || null);
                                            setPaymentError(null);
                                            setUploadError(null);
                                            setIsLogPaymentOpen(true);
                                          }}
                                          className="w-full px-3 py-2 text-left text-xs rounded-lg text-neutral-300 hover:bg-neutral-900 hover:text-white flex items-center space-x-2 transition-colors"
                                        >
                                          <Pencil className="w-3.5 h-3.5" />
                                          <span>Edit payment</span>
                                        </button>
                                      ) : (
                                        <div className="relative group/tip w-full">
                                          <button
                                            type="button"
                                            disabled
                                            className="w-full px-3 py-2 text-left text-xs rounded-lg text-neutral-600 cursor-not-allowed flex items-center space-x-2"
                                          >
                                            <Pencil className="w-3.5 h-3.5 text-neutral-600" />
                                            <span>Edit payment</span>
                                          </button>
                                          <div
                                            role="tooltip"
                                            className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/tip:block z-50 whitespace-nowrap rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-neutral-300 shadow-xl"
                                          >
                                            {p.status === "confirmed" ? "Already confirmed" : "Already rejected"}
                                          </div>
                                        </div>
                                      )
                                    )}
                                  </>
                                )}

                                {/* Divider + View Details */}
                                <div className="my-1 border-t border-neutral-800" />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenPaymentMenuId(null);
                                    setSelectedPayment(p);
                                    setIsPaymentDetailsOpen(true);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs rounded-lg text-neutral-300 hover:bg-neutral-900 hover:text-white flex items-center space-x-2 transition-colors"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  <span>View details</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Log / Edit Payment Modal ── */}
      {isLogPaymentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl my-8">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-neutral-800">
              <h2 className="text-xl font-bold text-white font-sans">
                {editingPaymentId ? "Edit Pending Payment" : "Add Payment"}
              </h2>
              <button
                onClick={() => { setIsLogPaymentOpen(false); resetPaymentForm(); }}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLogPaymentSubmit} className="space-y-4">
              {paymentError && (
                <div className="rounded bg-red-950/20 border border-red-900/30 p-2.5 text-xs text-red-400">
                  {paymentError}
                </div>
              )}

              <div>
                <label htmlFor="paymentAmount" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Amount (₦)
                </label>
                <input
                  id="paymentAmount"
                  type="text"
                  inputMode="decimal"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(formatInputNumber(e.target.value))}
                  className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                  placeholder="e.g. 150,000"
                />
                {billingSummary && billingSummary.isRentSet && (
                  <span className="text-xs text-neutral-400 block mt-1">
                    {formatCurrency(
                      editingPaymentId && payments
                        ? billingSummary.remainingLeaseRent + Number(payments.find((p) => p.id === editingPaymentId)?.amount || 0)
                        : billingSummary.remainingLeaseRent
                    )} left on this lease
                  </span>
                )}
              </div>

              <div>
                <label htmlFor="paymentDate" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Payment Date
                </label>
                <input
                  id="paymentDate"
                  type="date"
                  required
                  max={new Date().toISOString().split("T")[0]}
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                />
              </div>

              <div>
                <label htmlFor="paymentMethod" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Payment Method
                </label>
                <Select
                  id="paymentMethod"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="mt-1 h-10 text-sm"
                >
                  <option value={PaymentMethod.cash}>Cash</option>
                  <option value={PaymentMethod.bank_transfer}>Bank Transfer</option>
                  <option value={PaymentMethod.cheque}>Cheque</option>
                  <option value={PaymentMethod.other}>Other</option>
                </Select>
              </div>

              <div>
                <label htmlFor="paymentNotes" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Notes
                </label>
                <textarea
                  id="paymentNotes"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-20"
                  placeholder="Optional bank transaction details, reference..."
                />
              </div>

              {/* Proof Upload */}
              <div className="space-y-2 pt-2">
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Proof of Payment (Optional)
                </label>
                <div className="flex flex-col space-y-2">
                  <input
                    type="file"
                    accept=".pdf, image/*"
                    onChange={handleProofUpload}
                    disabled={uploadingProof}
                    className="block w-full text-xs text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-white file:text-neutral-950 hover:file:bg-neutral-200 file:cursor-pointer disabled:opacity-50"
                  />
                  {uploadError && <p className="text-xs text-red-400 font-sans">{uploadError}</p>}
                  {uploadingProof && <p className="text-xs text-neutral-400 animate-pulse">Uploading file...</p>}
                  {proofUrl && (
                    <p className="text-xs text-green-400 font-sans">
                      ✓ Proof uploaded successfully: {proofUrl.split("/").pop()}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex space-x-3 mt-6 pt-4 border-t border-neutral-800">
                <Button
                  type="button"
                  onClick={() => { setIsLogPaymentOpen(false); resetPaymentForm(); }}
                  variant="outline"
                  className="w-1/2 border-neutral-800 text-white hover:bg-neutral-900 h-10 text-sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createPayment.isPending || updatePendingPayment.isPending || uploadingProof}
                  className="w-1/2 bg-white text-neutral-950 hover:bg-neutral-200 h-10 text-sm font-semibold"
                >
                  {createPayment.isPending || updatePendingPayment.isPending
                    ? "Saving..."
                    : editingPaymentId
                    ? "Save Changes"
                    : "Add Payment"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Flag Incorrect Payment Modal ── */}
      {isFlagOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-neutral-800">
              <h2 className="text-lg font-bold text-white font-sans">Flag Payment as Incorrect</h2>
              <button
                onClick={() => { setIsFlagOpen(false); setFlagReason(""); setFlagPaymentId(""); }}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!flagReason.trim()) { alert("Reason is required."); return; }
                await flagPayment.mutateAsync({ paymentId: flagPaymentId, reason: flagReason });
              }}
              className="space-y-4"
            >
              <div>
                <label htmlFor="flagReason" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Reason for flag
                </label>
                <textarea
                  id="flagReason"
                  required
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-24"
                  placeholder="Explain why this landlord-logged payment is incorrect..."
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <Button
                  type="button"
                  onClick={() => { setIsFlagOpen(false); setFlagReason(""); setFlagPaymentId(""); }}
                  variant="outline"
                  className="w-1/2 border-neutral-800 text-white hover:bg-neutral-900 h-[38px]"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={flagPayment.isPending}
                  className="w-1/2 bg-red-600 hover:bg-red-500 text-white font-semibold h-[38px]"
                >
                  {flagPayment.isPending ? "Submitting..." : "Flag Payment"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Payment Details Modal ── */}
      {isPaymentDetailsOpen && selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-neutral-800">
              <h2 className="text-xl font-bold text-white font-sans">Payment Details</h2>
              <button
                onClick={() => { setIsPaymentDetailsOpen(false); setSelectedPayment(null); }}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Amount</span>
                  <span className="text-base font-bold text-white mt-1 block">
                    {formatCurrency(selectedPayment.amount)}
                  </span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Status</span>
                  <span className="mt-1 block">
                    <span
                      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        selectedPayment.status === "confirmed"
                          ? "bg-green-950/30 text-green-400 border-green-900/30"
                          : selectedPayment.status === "disputed"
                          ? "bg-red-950/30 text-red-400 border-red-900/30"
                          : "bg-yellow-950/30 text-yellow-400 border-yellow-900/30"
                      }`}
                    >
                      {paymentStatusLabel[selectedPayment.status] ?? selectedPayment.status}
                    </span>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Payment Date</span>
                  <span className="text-neutral-300 mt-1 block">
                    {new Date(selectedPayment.paymentDate).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Method</span>
                  <span className="text-neutral-300 mt-1 block capitalize">
                    {selectedPayment.method.replace("_", " ")}
                  </span>
                </div>
              </div>

              <div>
                <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Period Covered</span>
                <span className="text-neutral-300 mt-1 block">
                  {new Date(selectedPayment.periodStart).toLocaleDateString()} –{" "}
                  {new Date(selectedPayment.periodEnd).toLocaleDateString()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Logged By</span>
                  <span className="text-neutral-300 mt-1 block capitalize">
                    {selectedPayment.recorder?.fullName || "System"} ({selectedPayment.recordedByRole})
                  </span>
                </div>
                {selectedPayment.confirmedAt && (
                  <div>
                    <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Confirmed At</span>
                    <span className="text-neutral-300 mt-1 block">
                      {new Date(selectedPayment.confirmedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              {selectedPayment.notes && (
                <div>
                  <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Notes</span>
                  <p className="text-neutral-300 mt-1 bg-neutral-900/50 p-2.5 rounded-lg border border-neutral-800 text-xs">
                    {selectedPayment.notes}
                  </p>
                </div>
              )}

              {selectedPayment.disputedByTenant && (
                <div>
                  <span className="block text-xs font-semibold text-red-400 uppercase tracking-wider">Tenant Dispute Reason</span>
                  <p className="text-red-400 mt-1 bg-red-950/10 p-2.5 rounded-lg border border-red-900/20 text-xs">
                    {selectedPayment.disputedByReason}
                  </p>
                </div>
              )}

              {selectedPayment.proofUrl ? (
                <div>
                  <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Proof Document</span>
                  <div className="mt-2 flex flex-col items-start gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleViewPaymentProof(selectedPayment.proofUrl!)}
                      className="inline-flex items-center text-xs text-white hover:underline bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-neutral-800"
                    >
                      View / Download Proof
                    </button>
                    {selectedPayment.status === "pending" && selectedPayment.recordedBy === user?.id ? (
                      <button
                        type="button"
                        onClick={() => setIsDeleteProofConfirmOpen(true)}
                        className="text-xs text-red-500 hover:text-red-400 hover:underline transition-colors mt-0.5"
                      >
                        Remove proof
                      </button>
                    ) : (
                      <p className="text-xs text-neutral-500 italic mt-0.5">
                        Proof is locked because this payment is confirmed.
                      </p>
                    )}
                  </div>
                </div>
              ) : selectedPayment.status === "pending" && selectedPayment.recordedBy === user?.id ? (
                <div>
                  <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Proof Document</span>
                  <div className="mt-2">
                    <label className="block">
                      <span className="sr-only">Upload proof document</span>
                      <input
                        type="file"
                        accept=".pdf, image/*"
                        onChange={handleDetailProofUpload}
                        disabled={uploadingDetailProof}
                        className="block w-full text-xs text-neutral-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-white file:text-neutral-950 hover:file:bg-neutral-200 file:cursor-pointer disabled:opacity-50"
                      />
                    </label>
                    {uploadingDetailProof && <p className="text-xs text-neutral-400 mt-1 animate-pulse">Uploading file...</p>}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="pt-4 border-t border-neutral-800">
              <Button
                onClick={() => { setIsPaymentDetailsOpen(false); setSelectedPayment(null); }}
                className="w-full bg-white text-neutral-950 hover:bg-neutral-200 font-semibold h-[38px]"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Payment Proof Dialog */}
      <ConfirmDialog
        isOpen={isDeleteProofConfirmOpen}
        onClose={() => setIsDeleteProofConfirmOpen(false)}
        onConfirm={async () => {
          if (selectedPayment) {
            await deleteProofMutation.mutateAsync({ paymentId: selectedPayment.id });
          }
        }}
        title="Remove payment proof?"
        description="Are you sure you want to remove this proof document?"
        confirmText="Remove"
        variant="danger"
        isLoading={deleteProofMutation.isPending}
      />
    </main>
  </div>
  );
}

// ─── Root page — orchestrates selector vs. ledger view ────────────────────────
export default function TenantPaymentsPage() {
  const { data: leases, isLoading } = trpc.leases.getMine.useQuery();

  // Auto-select if there's only one lease; null = show selector
  const [selectedLeaseId, setSelectedLeaseId] = useState<string | null>(null);

  // Once leases load, auto-select when there's exactly one
  useEffect(() => {
    if (!leases) return;
    if (leases.length === 1) {
      setSelectedLeaseId(leases[0].id);
    }
    // If there are multiple leases AND we have a previously selected id that's
    // no longer valid (edge case), reset to null
    if (leases.length > 1 && selectedLeaseId && !leases.find((l) => l.id === selectedLeaseId)) {
      setSelectedLeaseId(null);
    }
  }, [leases]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white">
        <PageHeader title="Payments" />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <Skeleton className="h-8 w-44" />
              <Skeleton className="h-4 w-60" />
            </div>
            <Skeleton className="h-10 w-36 rounded-md" />
          </div>

          {/* 3 Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 backdrop-blur-sm space-y-2"
              >
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-3 w-40 mt-1" />
              </div>
            ))}
          </div>

          {/* Ledger Table Card */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/20 backdrop-blur-sm overflow-hidden">
            <div className="p-6 border-b border-neutral-800/80 flex justify-between items-center">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-28 rounded-lg" />
            </div>
            <div className="p-4 border-b border-neutral-800 flex gap-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16 ml-auto" />
            </div>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-4 border-b border-neutral-800/60 flex items-center justify-between">
                <div className="flex items-center space-x-6">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (!leases || leases.length === 0) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white">
        <PageHeader title="Payments" />
        <main className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center mx-auto">
            <CreditCard className="w-8 h-8 text-neutral-600" />
          </div>
          <h1 className="text-xl font-bold text-white">No active lease</h1>
          <p className="text-neutral-400 text-sm">
            You need an active tenancy to view your payment ledger.
          </p>
        </main>
      </div>
    );
  }

  // Multiple leases, none selected yet → show selector
  if (leases.length > 1 && !selectedLeaseId) {
    return <LeaseSelector leases={leases} onSelect={setSelectedLeaseId} />;
  }

  // Find the selected lease object
  const selectedLease = leases.find((l) => l.id === selectedLeaseId) ?? leases[0];

  return (
    <LeasePaymentLedger
      lease={selectedLease}
      showBackButton={leases.length > 1}
      onBack={() => setSelectedLeaseId(null)}
    />
  );
}
