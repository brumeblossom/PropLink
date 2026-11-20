'use client';

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { DetailActionRow } from "@/components/layout/DetailActionRow";
import { Select } from "@/components/ui/select";
import { ActionMenu } from "@/components/ui/action-menu";
import { LeaseDocumentsCard } from "@/components/documents/LeaseDocumentsCard";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatInputNumber, cn } from "@/lib/utils";
import {
  formatDateGB,
  formatLagosYMD,
  getLagosYMD,
  getDueDateStatus,
} from "@/lib/billing";
import { getNextLease } from "@/lib/leases";
import { formatRentFrequency } from "@/lib/rent";
import {
  Plus,
  Paperclip,
  Eye,
  Pencil,
  AlertTriangle,
  X,
  Upload,
  Loader2,
} from "lucide-react";
import { PaymentMethod } from "@prisma/client";

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
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950/40 border border-emerald-900/40 text-emerald-400">
          Active
        </span>
      );
    case "renewal_due":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-950/40 border border-amber-900/40 text-amber-400">
          Renewal due
        </span>
      );
    case "upcoming":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-950/40 border border-blue-900/40 text-blue-400">
          Upcoming
        </span>
      );
    case "expired":
    case "terminated":
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-850 border border-neutral-800 text-neutral-400">
          Ended
        </span>
      );
  }
}

function formatUnitType(type: string): string {
  return type
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function TenantRentalDetailsPage({
  params,
}: {
  params: { leaseId: string };
}) {
  const { leaseId } = params;
  const router = useRouter();
  const utils = trpc.useUtils();
  const { toast } = useToast();

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => formatLagosYMD(new Date()), []);

  // Fetch rental details
  const {
    data: lease,
    isLoading: isLoadingRental,
    isError: isRentalError,
  } = trpc.leases.getTenantRental.useQuery(
    { leaseId },
    { retry: false }
  );

  // Fetch billing summary
  const { data: billingSummary } = trpc.payments.getBillingSummary.useQuery(
    { leaseId },
    { enabled: !!leaseId }
  );

  // Fetch payments list
  const { data: payments, isLoading: isLoadingPayments } = trpc.payments.list.useQuery(
    { leaseId },
    { enabled: !!leaseId }
  );

  // Mutations
  const createPaymentMutation = trpc.payments.create.useMutation({
    onSuccess: () => {
      utils.payments.list.invalidate({ leaseId });
      utils.payments.getBillingSummary.invalidate({ leaseId });
      utils.leases.getMine.invalidate();
      toast("Payment logged successfully", "success");
      setIsAddPaymentOpen(false);
      resetPaymentForm();
    },
    onError: (err) => {
      setPaymentError(err.message || "Failed to log payment.");
    },
  });

  const updatePendingMutation = trpc.payments.updatePending.useMutation({
    onSuccess: () => {
      utils.payments.list.invalidate({ leaseId });
      utils.payments.getBillingSummary.invalidate({ leaseId });
      utils.leases.getMine.invalidate();
      toast("Payment updated", "success");
      setIsAddPaymentOpen(false);
      resetPaymentForm();
    },
    onError: (err) => {
      setPaymentError(err.message || "Failed to update payment.");
    },
  });

  const flagPaymentMutation = trpc.payments.flag.useMutation({
    onSuccess: () => {
      utils.payments.list.invalidate({ leaseId });
      toast("Dispute submitted", "success");
      setIsDisputeOpen(false);
      setDisputeReason("");
      setDisputePaymentId(null);
    },
    onError: (err) => {
      toast(err.message || "Failed to submit dispute", "error");
    },
  });

  const getUploadUrlMutation = trpc.payments.getUploadUrl.useMutation();

  // Form states
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayStr);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.bank_transfer);
  const [paymentNotes, setPaymentNotes] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofFileName, setProofFileName] = useState<string | null>(null);
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Dispute state
  const [isDisputeOpen, setIsDisputeOpen] = useState(false);
  const [disputePaymentId, setDisputePaymentId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");

  // Payment details view state
  const [selectedPayment, setSelectedPayment] = useState<NonNullable<typeof payments>[number] | null>(null);

  // Year filter
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());

  const resetPaymentForm = () => {
    setAmountInput("");
    setPaymentDate(todayStr);
    setPaymentMethod(PaymentMethod.bank_transfer);
    setPaymentNotes("");
    setProofUrl(null);
    setProofFileName(null);
    setUploadError(null);
    setPaymentError(null);
    setEditingPaymentId(null);
  };

  const isPaidInFull = Boolean(
    billingSummary && billingSummary.isRentSet && billingSummary.remainingLeaseRent <= 0
  );

  const availableYears = useMemo(() => {
    const curYear = new Date().getFullYear();
    if (!payments || payments.length === 0) return [curYear];
    const years = new Set(payments.map((p) => new Date(p.paymentDate).getFullYear()));
    years.add(curYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [payments]);

  const filteredPayments = useMemo(() => {
    if (!payments) return [];
    return payments.filter((p) => new Date(p.paymentDate).getFullYear() === selectedYear);
  }, [payments, selectedYear]);

  // Compute status and next lease
  const leaseStatus = useMemo(() => {
    if (!lease) return "active";
    return computeLeaseStatus(lease, today);
  }, [lease, today]);

  const nextLease = useMemo(() => {
    if (!lease?.unit?.leases) return null;
    return getNextLease(lease.unit.leases, today, lease);
  }, [lease, today]);

  const daysUntilNext = useMemo(() => {
    if (!nextLease) return null;
    const target = getLagosYMD(nextLease.startDate);
    const cur = getLagosYMD(today);
    const d1 = Date.UTC(target.year, target.month - 1, target.day);
    const d2 = Date.UTC(cur.year, cur.month - 1, cur.day);
    return Math.max(0, Math.round((d1 - d2) / (1000 * 60 * 60 * 24)));
  }, [nextLease, today]);

  // Handle proof upload
  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);

    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File size exceeds 10MB limit.");
      return;
    }

    const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      setUploadError("Only PDF, JPG, and PNG files are allowed.");
      return;
    }

    setIsUploadingProof(true);
    try {
      const { signedUrl, path } = await getUploadUrlMutation.mutateAsync({
        leaseId,
        fileName: file.name,
      });

      const res = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!res.ok) throw new Error("Failed to upload file to storage.");
      setProofUrl(path);
      setProofFileName(file.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to upload receipt.";
      setUploadError(msg);
    } finally {
      setIsUploadingProof(false);
    }
  };

  // Submit payment form
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError(null);

    const amount = parseFloat(amountInput.replace(/,/g, ""));
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
        await updatePendingMutation.mutateAsync({
          paymentId: editingPaymentId,
          amount,
          paymentDate: new Date(paymentDate).toISOString(),
          method: paymentMethod,
          notes: paymentNotes || undefined,
          proofUrl: proofUrl || undefined,
        });
      } else {
        await createPaymentMutation.mutateAsync({
          leaseId,
          amount,
          paymentDate: new Date(paymentDate).toISOString(),
          method: paymentMethod,
          notes: paymentNotes || undefined,
          proofUrl: proofUrl || undefined,
        });
      }
    } catch {
      // Errors handled by mutation onError
    }
  };

  const handleOpenEditPayment = (payment: NonNullable<typeof payments>[number]) => {
    setEditingPaymentId(payment.id);
    setAmountInput(formatInputNumber(String(payment.amount)));
    setPaymentDate(formatLagosYMD(payment.paymentDate));
    setPaymentMethod(payment.method as PaymentMethod);
    setPaymentNotes(payment.notes || "");
    setProofUrl(payment.proofUrl || null);
    setProofFileName(payment.proofUrl ? payment.proofUrl.split("/").pop() || "Receipt" : null);
    setPaymentError(null);
    setUploadError(null);
    setIsAddPaymentOpen(true);
  };

  const handleOpenAddPayment = () => {
    resetPaymentForm();
    if (billingSummary && billingSummary.outstanding > 0) {
      setAmountInput(
        formatInputNumber(String(Math.min(billingSummary.outstanding, billingSummary.remainingLeaseRent)))
      );
    }
    setIsAddPaymentOpen(true);
  };

  const handleViewReceipt = async (path: string) => {
    try {
      const { signedUrl } = await utils.client.payments.getDownloadUrl.query({ path });
      window.open(signedUrl, "_blank");
    } catch {
      toast("Could not open payment receipt", "error");
    }
  };

  if (isLoadingRental) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white">
        <PageHeader title="Rental Details" />
        <PageContainer className="space-y-6">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-56 w-full rounded-xl" />
            <Skeleton className="h-56 w-full rounded-xl" />
          </div>
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </PageContainer>
      </div>
    );
  }

  if (isRentalError || !lease) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white">
        <PageHeader title="Rental Not Found" />
        <PageContainer className="py-16 text-center space-y-4">
          <h1 className="text-xl font-bold text-white">Rental not found</h1>
          <p className="text-sm text-neutral-400 max-w-sm mx-auto">
            This rental does not exist or you do not have permission to view it.
          </p>
          <div className="pt-2">
            <Button
              onClick={() => router.push("/tenant")}
              variant="outline"
              className="text-xs h-9 px-4 border-neutral-800 text-neutral-300 hover:text-white"
            >
              ← Back to Home
            </Button>
          </div>
        </PageContainer>
      </div>
    );
  }

  const unit = lease.unit;
  const property = unit.property;
  const landlord = property.landlord;

  // Billing status
  const dueStatus = billingSummary
    ? getDueDateStatus(
        billingSummary.nextDueDate,
        lease.endDate,
        today,
        billingSummary.unpaidPeriods
      )
    : null;

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <PageHeader title={`Unit ${unit.unitNumber}`} />

      <PageContainer className="space-y-6">
        {/* Action Row: Back to Home + Mobile + Add payment button */}
        <DetailActionRow
          backHref="/tenant"
          backLabel="Home"
          phonePrimaryAction={{
            label: "Add payment",
            icon: <Plus className="w-4 h-4" />,
            onClick: handleOpenAddPayment,
            disabled: isPaidInFull,
            title: isPaidInFull ? "This lease is fully paid." : undefined,
          }}
          actions={[]}
        />

        {/* Title Box */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-white font-sans">
                  Unit {unit.unitNumber}
                </h1>
                <StatusBadge status={leaseStatus} />
              </div>
              <p className="text-sm text-neutral-400 mt-1">
                {property.name} · {property.address}, {property.city}
              </p>
            </div>

            <div className="sm:text-right shrink-0">
              <span className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                Landlord
              </span>
              <span className="text-sm font-semibold text-white block mt-0.5">
                {landlord.fullName}
              </span>
              <span className="text-xs text-neutral-400 block mt-0.5">
                {landlord.email}
              </span>
            </div>
          </div>
        </div>

        {/* Two cards side by side (Lease 3fr & Documents 2fr) */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">
          {/* Lease Details Card (3fr) */}
          <div className="lg:col-span-3 rounded-xl border border-neutral-800 bg-neutral-900/20 p-5 space-y-4 h-full flex flex-col justify-between">
            <div>
              <div>
                <h3 className="font-bold text-white text-lg">Lease</h3>
                <p className="text-neutral-500 text-xs mt-0.5">
                  Tenancy terms and duration.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 text-xs">
                <div>
                  <span className="text-neutral-500 block uppercase tracking-wider text-[10px] font-bold">
                    Period
                  </span>
                  <span className="text-neutral-200 font-medium block mt-1">
                    {formatDateGB(lease.startDate)} – {formatDateGB(lease.endDate)}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 block uppercase tracking-wider text-[10px] font-bold">
                    Rent
                  </span>
                  <span className="text-white font-semibold block mt-1">
                    {formatCurrency(lease.rentAmount)} / {formatRentFrequency(lease.rentFrequency)}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 block uppercase tracking-wider text-[10px] font-bold">
                    Deposit
                  </span>
                  <span className="text-neutral-200 font-medium block mt-1">
                    {lease.depositAmount ? formatCurrency(lease.depositAmount) : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 block uppercase tracking-wider text-[10px] font-bold">
                    Unit type
                  </span>
                  <span className="text-neutral-200 font-medium block mt-1">
                    {formatUnitType(unit.unitType)}
                  </span>
                </div>
              </div>
            </div>

            {/* Slim Next Lease row if present */}
            {nextLease && (
              <div className="mt-4 pt-4 border-t border-neutral-800/80">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-neutral-400 font-medium">Next lease</span>
                    <span className="text-neutral-500">·</span>
                    <span className="text-neutral-300">
                      {formatDateGB(nextLease.startDate)} – {formatDateGB(nextLease.endDate)}
                    </span>
                    <span className="text-neutral-500">·</span>
                    <span className="text-white font-medium">
                      {formatCurrency(nextLease.rentAmount)} / {formatRentFrequency(nextLease.rentFrequency)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-950/40 border border-blue-900/40 text-blue-400">
                      Upcoming
                    </span>
                    {daysUntilNext !== null && (
                      <span className="text-neutral-400 text-[11px]">
                        Starts in {daysUntilNext} days
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Documents Card (2fr) */}
          <LeaseDocumentsCard leaseId={lease.id} mode="tenant" className="lg:col-span-2 h-full" />
        </div>

        {/* Billing Summary Card */}
        {billingSummary && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <span className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                  RENT DUE SO FAR
                </span>
                <span className="text-[22px] font-semibold text-white block leading-tight">
                  {formatCurrency(billingSummary.rentDueToDate)}
                </span>
                <span className="block text-xs text-neutral-400">
                  {billingSummary.periodsDue} {billingSummary.periodsDue === 1 ? "period" : "periods"} since {formatDateGB(lease.startDate)}
                </span>
              </div>

              <div className="space-y-1">
                <span className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                  PAID (CONFIRMED)
                </span>
                <span className="text-[22px] font-semibold text-white block leading-tight">
                  {formatCurrency(billingSummary.paidToDate)}
                </span>
              </div>

              <div className="space-y-1">
                <span className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                  OUTSTANDING
                </span>
                {billingSummary.credit > 0 ? (
                  <span className="text-[22px] font-semibold text-emerald-400 block leading-tight">
                    Credit {formatCurrency(billingSummary.credit)}
                  </span>
                ) : billingSummary.outstanding > 0 ? (
                  <span className="text-[22px] font-semibold text-red-400 block leading-tight">
                    {formatCurrency(billingSummary.outstanding)}
                  </span>
                ) : (
                  <span className="text-[22px] font-semibold text-emerald-400 block leading-tight">
                    ₦0
                  </span>
                )}
              </div>
            </div>

            {/* Overdue / Paid-to-end / Status line */}
            {dueStatus && (
              <div className="pt-3 border-t border-neutral-800/60 text-xs sm:text-sm text-neutral-300">
                <span
                  className={cn(
                    dueStatus.status === "overdue"
                      ? "text-red-400 font-medium"
                      : dueStatus.status === "today"
                      ? "text-amber-400 font-medium"
                      : dueStatus.status === "paid_in_full"
                      ? "text-emerald-400 font-medium"
                      : "text-neutral-300"
                  )}
                >
                  {dueStatus.text}
                </span>
                {billingSummary.pendingAmount > 0 && (
                  <span className="text-amber-400 font-medium ml-1">
                    • {formatCurrency(billingSummary.pendingAmount)} waiting for landlord confirmation
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Payment History */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="font-bold text-white text-lg">Payment history</h3>

            <div className="flex items-center gap-3">
              {availableYears.length > 1 && (
                <div className="w-28">
                  <Select
                    value={String(selectedYear)}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                    className="h-8 text-xs"
                  >
                    {availableYears.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {/* On web (>=640px) the Add payment primary button sits on the right */}
              <div className="relative group hidden sm:inline-block">
                <Button
                  onClick={handleOpenAddPayment}
                  disabled={isPaidInFull}
                  className="bg-white text-neutral-950 hover:bg-neutral-200 font-semibold text-xs h-8 px-3 flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Plus className="w-4 h-4" />
                  Add payment
                </Button>
                {isPaidInFull && (
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full right-0 mb-2 hidden group-hover:block z-50 whitespace-nowrap rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs font-medium text-neutral-200 shadow-xl"
                  >
                    This lease is fully paid.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Desktop Payments Table (>= 640px) */}
          <div className="hidden sm:block rounded-xl border border-neutral-800 bg-neutral-900/20 overflow-hidden">
            <table className="w-full table-fixed divide-y divide-neutral-800/80 text-left text-sm">
              <thead className="bg-neutral-900/60 text-xs font-medium text-neutral-400 uppercase tracking-wider">
                <tr>
                  <th scope="col" className="w-[20%] px-4 py-3">
                    Date logged
                  </th>
                  <th scope="col" className="w-[20%] px-4 py-3">
                    Amount
                  </th>
                  <th scope="col" className="w-[18%] px-4 py-3">
                    Method
                  </th>
                  <th scope="col" className="w-[18%] px-4 py-3">
                    Receipt
                  </th>
                  <th scope="col" className="w-[14%] px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="w-[10%] px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {isLoadingPayments ? (
                  [...Array(3)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="px-4 py-3">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-neutral-500">
                      <p className="text-xs">No payments recorded for {selectedYear}.</p>
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((p) => {
                    const isPending = p.status === "pending";
                    const isConfirmed = p.status === "confirmed";
                    const isFlagged = p.status === "disputed" || Boolean(p.disputedByTenant);

                    const actions = [
                      {
                        label: "View details",
                        icon: <Eye className="w-4 h-4" />,
                        onClick: () => setSelectedPayment(p),
                      },
                      ...(p.proofUrl
                        ? [
                            {
                              label: "Download receipt",
                              icon: <Paperclip className="w-4 h-4" />,
                              onClick: () => handleViewReceipt(p.proofUrl!),
                            },
                          ]
                        : []),
                      ...(isPending
                        ? [
                            {
                              label: "Edit payment",
                              icon: <Pencil className="w-4 h-4" />,
                              onClick: () => handleOpenEditPayment(p),
                            },
                          ]
                        : []),
                      ...(isConfirmed && !isFlagged
                        ? [
                            {
                              label: "Dispute payment",
                              icon: <AlertTriangle className="w-4 h-4" />,
                              variant: "danger" as const,
                              onClick: () => {
                                setDisputePaymentId(p.id);
                                setIsDisputeOpen(true);
                              },
                            },
                          ]
                        : []),
                    ];

                    return (
                      <tr key={p.id} className="hover:bg-neutral-900/40 transition-colors">
                        <td className="px-4 py-3 text-xs text-neutral-300">
                          {formatDateGB(p.paymentDate)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-white">
                          {formatCurrency(p.amount)}
                        </td>
                        <td className="px-4 py-3 text-xs text-neutral-300 capitalize">
                          {p.method.replace(/_/g, " ")}
                        </td>
                        <td className="px-4 py-3 text-xs truncate">
                          {p.proofUrl ? (
                            <button
                              type="button"
                              onClick={() => handleViewReceipt(p.proofUrl!)}
                              className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 hover:underline"
                            >
                              <Paperclip className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate max-w-[120px]">
                                {p.proofUrl.split("/").pop()?.replace(/^[0-9a-f-]+_?/, "") || "Receipt"}
                              </span>
                            </button>
                          ) : (
                            <span className="text-neutral-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isPending ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-950/40 border border-amber-900/40 text-amber-400">
                              Pending
                            </span>
                          ) : isFlagged ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-950/40 border border-rose-900/40 text-rose-400">
                              Disputed
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-950/40 border border-emerald-900/40 text-emerald-400">
                              Confirmed
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <ActionMenu items={actions} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Payment Cards (< 640px) */}
          <div className="sm:hidden space-y-3">
            {isLoadingPayments ? (
              [...Array(2)].map((_, i) => (
                <div key={i} className="rounded-xl border border-neutral-800 p-4 space-y-2">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-4 w-40" />
                </div>
              ))
            ) : filteredPayments.length === 0 ? (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-6 text-center text-neutral-500">
                <p className="text-xs">No payments recorded for {selectedYear}.</p>
              </div>
            ) : (
              filteredPayments.map((p) => {
                const isPending = p.status === "pending";
                const isConfirmed = p.status === "confirmed";
                const isFlagged = p.status === "disputed" || Boolean(p.disputedByTenant);

                const actions = [
                  {
                    label: "View details",
                    icon: <Eye className="w-4 h-4" />,
                    onClick: () => setSelectedPayment(p),
                  },
                  ...(p.proofUrl
                    ? [
                        {
                          label: "Download receipt",
                          icon: <Paperclip className="w-4 h-4" />,
                          onClick: () => handleViewReceipt(p.proofUrl!),
                        },
                      ]
                    : []),
                  ...(isPending
                    ? [
                        {
                          label: "Edit payment",
                          icon: <Pencil className="w-4 h-4" />,
                          onClick: () => handleOpenEditPayment(p),
                        },
                      ]
                    : []),
                  ...(isConfirmed && !isFlagged
                    ? [
                        {
                          label: "Dispute payment",
                          icon: <AlertTriangle className="w-4 h-4" />,
                          variant: "danger" as const,
                          onClick: () => {
                            setDisputePaymentId(p.id);
                            setIsDisputeOpen(true);
                          },
                        },
                      ]
                    : []),
                ];

                return (
                  <div
                    key={p.id}
                    className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base font-semibold text-white">
                        {formatCurrency(p.amount)}
                      </span>
                      <ActionMenu items={actions} />
                    </div>

                    <div className="flex items-center justify-between text-xs text-neutral-400">
                      <span>{formatDateGB(p.paymentDate)}</span>
                      <span className="capitalize">{p.method.replace(/_/g, " ")}</span>
                    </div>

                    <div className="pt-2 border-t border-neutral-800/60 flex items-center justify-between text-xs">
                      <div>
                        {isPending ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-950/40 border border-amber-900/40 text-amber-400">
                            Pending
                          </span>
                        ) : isFlagged ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-950/40 border border-rose-900/40 text-rose-400">
                            Disputed
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/40 border border-emerald-900/40 text-emerald-400">
                            Confirmed
                          </span>
                        )}
                      </div>

                      {p.proofUrl && (
                        <button
                          type="button"
                          onClick={() => handleViewReceipt(p.proofUrl!)}
                          className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                          <span>Receipt</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </PageContainer>

      {/* Add / Edit Payment Modal (bottom sheet on phones, dialog on desktop) */}
      {isAddPaymentOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
          <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-neutral-800">
              <h2 className="text-lg font-bold text-white font-sans">
                {editingPaymentId ? "Edit Payment" : "Add Payment"}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setIsAddPaymentOpen(false);
                  resetPaymentForm();
                }}
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              {paymentError && (
                <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-3 text-xs text-red-400">
                  {paymentError}
                </div>
              )}

              {/* Rental shown read-only */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  Rental
                </label>
                <div className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-200 select-none">
                  Unit {unit.unitNumber} · {property.name}
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  Amount (₦)
                </label>
                <input
                  type="text"
                  required
                  placeholder="0"
                  value={amountInput}
                  onChange={(e) => {
                    setAmountInput(formatInputNumber(e.target.value));
                    setPaymentError(null);
                  }}
                  className="w-full bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-white/20"
                />
                {billingSummary && billingSummary.isRentSet && (
                  <p className="text-[11px] text-neutral-500 mt-1">
                    {formatCurrency(billingSummary.remainingLeaseRent)} left on this lease
                  </p>
                )}
              </div>

              {/* Date Paid */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  Date paid
                </label>
                <input
                  type="date"
                  required
                  max={todayStr}
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20"
                />
              </div>

              {/* Method */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  Payment method
                </label>
                <Select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full h-9 text-sm"
                >
                  <option value={PaymentMethod.bank_transfer}>Bank Transfer</option>
                  <option value={PaymentMethod.cash}>Cash</option>
                  <option value={PaymentMethod.cheque}>Cheque</option>
                  <option value={PaymentMethod.other}>Other</option>
                </Select>
              </div>

              {/* Receipt Upload */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  Receipt / Proof (optional)
                </label>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-850 text-xs font-medium text-neutral-200 transition-colors">
                    {isUploadingProof ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    <span>{isUploadingProof ? "Uploading..." : "Upload file"}</span>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      onChange={handleProofUpload}
                      disabled={isUploadingProof}
                      className="hidden"
                    />
                  </label>
                  {proofFileName && (
                    <span className="text-xs text-neutral-300 truncate max-w-[200px]" title={proofFileName}>
                      {proofFileName}
                    </span>
                  )}
                </div>
                {uploadError && (
                  <p className="text-[11px] text-red-400 mt-1">{uploadError}</p>
                )}
                <p className="text-[11px] text-neutral-500 mt-1">PDF, JPG or PNG up to 10MB.</p>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional reference or description"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full bg-neutral-900/60 border border-neutral-800 rounded-lg p-2.5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-white/20 resize-none"
                />
              </div>

              {/* Buttons: Cancel / Save */}
              <div className="flex gap-3 pt-3 border-t border-neutral-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddPaymentOpen(false);
                    resetPaymentForm();
                  }}
                  className="w-1/2 border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-900 h-10 text-sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createPaymentMutation.isPending || updatePendingMutation.isPending || isUploadingProof}
                  className="w-1/2 bg-white text-neutral-950 hover:bg-neutral-200 h-10 text-sm font-semibold"
                >
                  {createPaymentMutation.isPending || updatePendingMutation.isPending
                    ? "Saving..."
                    : "Save"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Details Modal */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-neutral-800">
              <h2 className="text-lg font-bold text-white font-sans">Payment details</h2>
              <button
                type="button"
                onClick={() => setSelectedPayment(null)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-neutral-500">Amount</span>
                <span className="font-semibold text-white text-sm">
                  {formatCurrency(selectedPayment.amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Date paid</span>
                <span className="text-neutral-200">{formatDateGB(selectedPayment.paymentDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Method</span>
                <span className="text-neutral-200 capitalize">
                  {selectedPayment.method.replace(/_/g, " ")}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">Status</span>
                <span>
                  {selectedPayment.status === "pending" ? (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-950/40 border border-amber-900/40 text-amber-400">
                      Pending confirmation
                    </span>
                  ) : selectedPayment.status === "disputed" || selectedPayment.disputedByTenant ? (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-950/40 border border-rose-900/40 text-rose-400">
                      Disputed
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/40 border border-emerald-900/40 text-emerald-400">
                      Confirmed
                    </span>
                  )}
                </span>
              </div>

              {selectedPayment.notes && (
                <div className="pt-2 border-t border-neutral-800/80">
                  <span className="text-neutral-500 block mb-1">Notes</span>
                  <p className="text-neutral-300 bg-neutral-900/40 p-2.5 rounded-lg border border-neutral-800/60 text-xs">
                    {selectedPayment.notes}
                  </p>
                </div>
              )}

              {selectedPayment.proofUrl && (
                <div className="pt-2 border-t border-neutral-800/80 flex justify-between items-center">
                  <span className="text-neutral-500">Receipt</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewReceipt(selectedPayment.proofUrl!)}
                    className="h-7 px-2.5 text-xs border-neutral-800 text-blue-400 hover:text-blue-300"
                  >
                    <Paperclip className="w-3.5 h-3.5 mr-1" />
                    View receipt
                  </Button>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-neutral-800">
              <Button
                type="button"
                onClick={() => setSelectedPayment(null)}
                className="w-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 h-9 text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dispute Payment Dialog */}
      {isDisputeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-neutral-800">
              <h2 className="text-lg font-bold text-white font-sans">Dispute payment</h2>
              <button
                type="button"
                onClick={() => {
                  setIsDisputeOpen(false);
                  setDisputeReason("");
                  setDisputePaymentId(null);
                }}
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-neutral-400 leading-relaxed">
                If you believe this payment entry is inaccurate or was logged in error, explain the issue below. Your landlord will be notified to review and resolve the dispute.
              </p>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  Reason for dispute
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain why this payment record is incorrect..."
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  className="w-full bg-neutral-900/60 border border-neutral-800 rounded-lg p-2.5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-white/20 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-3 border-t border-neutral-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsDisputeOpen(false);
                  setDisputeReason("");
                  setDisputePaymentId(null);
                }}
                className="w-1/2 border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-900 h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!disputeReason.trim() || flagPaymentMutation.isPending}
                onClick={async () => {
                  if (disputePaymentId && disputeReason.trim()) {
                    await flagPaymentMutation.mutateAsync({
                      paymentId: disputePaymentId,
                      reason: disputeReason.trim(),
                    });
                  }
                }}
                className="w-1/2 bg-rose-600 hover:bg-rose-500 text-white font-semibold h-9 text-xs"
              >
                {flagPaymentMutation.isPending ? "Submitting..." : "Submit dispute"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
