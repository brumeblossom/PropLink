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
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalField } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatInputNumber } from "@/lib/utils";
import {
  formatDateGB,
  formatLagosYMD,
} from "@/lib/billing";
import { LeasePeriodDropdown, type LeaseOption } from "@/components/leases/LeasePeriodDropdown";
import { UnitHeaderCard } from "@/components/leases/UnitHeaderCard";
import { LeaseDetailsCard } from "@/components/leases/LeaseDetailsCard";
import { BillingSummaryCard } from "@/components/leases/BillingSummaryCard";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Plus,
  Paperclip,
  Eye,
  Pencil,
  AlertTriangle,
  Upload,
  Loader2,
} from "lucide-react";
import { PaymentMethod } from "@prisma/client";

function computeLeaseStatus(
  lease: {
    startDate: Date | string;
    endDate?: Date | string | null;
    renewalWindowDays?: number | null;
    terminatedAt?: Date | string | null;
  },
  today = new Date()
): "active" | "ended" | "moved_out" | "upcoming" {
  if (lease.terminatedAt) return "moved_out";
  const todayStr = formatLagosYMD(today);
  const startStr = formatLagosYMD(lease.startDate);

  if (todayStr < startStr) return "upcoming";
  if (!lease.endDate) return "active";
  const endStr = formatLagosYMD(lease.endDate);
  if (todayStr >= endStr) return "ended";
  return "active";
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

  const filteredPayments = useMemo(() => {
    return payments || [];
  }, [payments]);

  // Compute status
  const leaseStatus = useMemo(() => {
    if (!lease) return "active";
    return computeLeaseStatus(lease, today);
  }, [lease, today]);

  // Options for LeasePeriodDropdown
  const leaseDropdownOptions: LeaseOption[] = useMemo(() => {
    if (!lease?.unit?.leases) return [];
    return lease.unit.leases.map((l) => {
      let status: LeaseOption["status"] = "ended";
      if (!l.terminatedAt && (!l.endDate || new Date(l.endDate) > today) && new Date(l.startDate) <= today) {
        status = "current";
      } else if (l.terminatedAt) {
        status = "moved_out";
      } else if (new Date(l.startDate) > today) {
        status = "upcoming";
      } else {
        status = "ended";
      }
      return {
        id: l.id,
        startDate: l.startDate,
        endDate: l.endDate,
        status,
      };
    });
  }, [lease, today]);

  const handleSelectLease = (selectedId: string) => {
    if (selectedId !== leaseId) {
      router.push(`/tenant/rentals/${selectedId}`);
    }
  };

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
      <div className="min-h-screen bg-background text-foreground">
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
      <div className="min-h-screen bg-background text-foreground">
        <PageHeader title="Rental Not Found" />
        <PageContainer className="py-16 text-center space-y-4">
          <h1 className="text-xl font-bold text-foreground">Rental not found</h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            This rental does not exist or you do not have permission to view it.
          </p>
          <div className="pt-2">
            <Button
              onClick={() => router.push("/tenant")}
              variant="outline"
              className="text-xs h-9 px-4 border-border text-foreground hover:bg-accent"
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

  return (
    <div className="min-h-screen bg-background text-foreground">
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
        <UnitHeaderCard
          viewer="tenant"
          unitNumber={unit.unitNumber}
          propertyName={property.name}
          propertyAddress={property.address ? `${property.address}, ${property.city}` : property.city}
          status={leaseStatus}
          person={{
            fullName: landlord.fullName,
            email: landlord.email,
          }}
        />

        {/* Two cards side by side (Lease 3fr & Documents 2fr) */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">
          {/* Lease Details Card (3fr) */}
          <LeaseDetailsCard
            viewer="tenant"
            startDate={lease.startDate}
            endDate={lease.endDate}
            rentAmount={lease.rentAmount}
            rentFrequency={lease.rentFrequency}
            depositAmount={lease.depositAmount}
            unitType={unit.unitType}
            className="lg:col-span-3"
          />

          {/* Documents Card (2fr) */}
          <LeaseDocumentsCard leaseId={lease.id} mode="tenant" className="lg:col-span-2 h-full" />
        </div>

        {/* Billing Summary Card */}
        {billingSummary && (
          <BillingSummaryCard
            viewer="tenant"
            billingSummary={billingSummary}
            leaseEndDate={lease.endDate}
            today={today}
          />
        )}

        {/* Payment History */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="font-bold text-foreground text-lg">Payment history</h3>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
              <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                <div className="sm:hidden text-sm font-semibold text-muted-foreground">
                  Payment history
                </div>
                {/* Add payment button */}
                <div>
                  {isPaidInFull ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex cursor-not-allowed">
                          <Button
                            disabled
                            size="action"
                            className="bg-muted text-muted-foreground opacity-50 pointer-events-none"
                          >
                            <Plus className="w-4 h-4" />
                            Add payment
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" align="end">
                        This lease is fully paid.
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Button
                      onClick={handleOpenAddPayment}
                      size="action"
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <Plus className="w-4 h-4" />
                      Add payment
                    </Button>
                  )}
                </div>
              </div>

              {/* Lease period dropdown */}
              <div className="w-full sm:w-auto">
                <LeasePeriodDropdown
                  leases={leaseDropdownOptions}
                  selectedLeaseId={leaseId}
                  onSelectLease={handleSelectLease}
                  isLandlord={false}
                />
              </div>
            </div>
          </div>

          {/* Desktop Payments Table (>= 640px) */}
          <div className="hidden sm:block rounded-xl border border-border bg-card/20 overflow-x-auto">
            <table className="w-full min-w-[640px] table-fixed divide-y divide-border/80 text-left text-sm">
              <thead className="bg-muted text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th scope="col" className="w-[20%] px-4 py-3 whitespace-nowrap">
                    Date logged
                  </th>
                  <th scope="col" className="w-[20%] px-4 py-3 whitespace-nowrap">
                    Amount
                  </th>
                  <th scope="col" className="w-[18%] px-4 py-3 whitespace-nowrap">
                    Method
                  </th>
                  <th scope="col" className="w-[18%] px-4 py-3 whitespace-nowrap">
                    Receipt
                  </th>
                  <th scope="col" className="w-[14%] px-4 py-3 whitespace-nowrap">
                    Status
                  </th>
                  <th scope="col" className="w-[10%] px-4 py-3 text-right whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
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
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                      <p className="text-xs">No payments recorded for this lease yet.</p>
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
                      <tr key={p.id} className="hover:bg-accent/40 transition-colors">
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateGB(p.paymentDate)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">
                          {formatCurrency(p.amount)}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground capitalize whitespace-nowrap">
                          {p.method.replace(/_/g, " ")}
                        </td>
                        <td className="px-4 py-3 text-xs truncate">
                          {p.proofUrl ? (
                            <button
                              type="button"
                              onClick={() => handleViewReceipt(p.proofUrl!)}
                              className="inline-flex items-center gap-1.5 text-primary hover:underline"
                            >
                              <Paperclip className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate max-w-[120px]">
                                {p.proofUrl.split("/").pop()?.replace(/^[0-9a-f-]+_?/, "") || "Receipt"}
                              </span>
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {isPending ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning-tint border border-warning/20 text-warning">
                              Pending
                            </span>
                          ) : isFlagged ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-destructive-tint border border-destructive/20 text-destructive">
                              Disputed
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success-tint border border-success/20 text-success">
                              Confirmed
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
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
                <div key={i} className="rounded-xl border border-border p-4 space-y-2">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-4 w-40" />
                </div>
              ))
            ) : filteredPayments.length === 0 ? (
              <div className="rounded-xl border border-border bg-card/20 p-6 text-center text-muted-foreground">
                <p className="text-xs">No payments recorded for this lease yet.</p>
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
                    className="rounded-xl border border-border bg-card/20 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base font-semibold text-foreground">
                        {formatCurrency(p.amount)}
                      </span>
                      <ActionMenu items={actions} />
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{formatDateGB(p.paymentDate)}</span>
                      <span className="capitalize">{p.method.replace(/_/g, " ")}</span>
                    </div>

                    <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs">
                      <div>
                        {isPending ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-warning-tint border border-warning/20 text-warning">
                            Pending
                          </span>
                        ) : isFlagged ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-destructive-tint border border-destructive/20 text-destructive">
                            Disputed
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-success-tint border border-success/20 text-success">
                            Confirmed
                          </span>
                        )}
                      </div>

                      {p.proofUrl && (
                        <button
                          type="button"
                          onClick={() => handleViewReceipt(p.proofUrl!)}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
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

      {/* Add / Edit Payment Modal */}
      <Modal
        open={isAddPaymentOpen}
        onOpenChange={(open) => {
          setIsAddPaymentOpen(open);
          if (!open) resetPaymentForm();
        }}
        isSaving={createPaymentMutation.isPending || updatePendingMutation.isPending || isUploadingProof}
        size="md"
      >
        <ModalHeader
          title={editingPaymentId ? "Edit Payment" : "Add Payment"}
          onClose={() => {
            setIsAddPaymentOpen(false);
            resetPaymentForm();
          }}
          isSaving={createPaymentMutation.isPending || updatePendingMutation.isPending || isUploadingProof}
        />
        <form onSubmit={handlePaymentSubmit} className="flex flex-col flex-1 min-h-0">
          <ModalBody className="space-y-6">
            {paymentError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive-tint/20 p-3 text-xs text-destructive">
                {paymentError}
              </div>
            )}

            {/* Rental shown read-only */}
            <ModalField label="Rental">
              <div className="w-full bg-muted border border-border rounded-lg px-4 h-12 flex items-center text-sm text-foreground select-none">
                Unit {unit.unitNumber} · {property.name}
              </div>
            </ModalField>

            {/* Amount */}
            <ModalField label="Amount (₦)" required>
              <input
                type="text"
                required
                placeholder="0"
                value={amountInput}
                onChange={(e) => {
                  setAmountInput(formatInputNumber(e.target.value));
                  setPaymentError(null);
                }}
                className="block w-full h-12 rounded-lg field-focus px-4 text-foreground placeholder:text-subtle-foreground text-sm"
              />
              {billingSummary && billingSummary.isRentSet && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {formatCurrency(billingSummary.remainingLeaseRent)} left on this lease
                </p>
              )}
            </ModalField>

            {/* Date Paid */}
            <ModalField label="Date Paid" required>
              <input
                type="date"
                required
                max={todayStr}
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="block w-full h-12 rounded-lg field-focus px-4 text-foreground text-sm"
              />
            </ModalField>

            {/* Method */}
            <ModalField label="Payment Method">
              <Select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="h-12 text-sm"
              >
                <option value={PaymentMethod.bank_transfer}>Bank Transfer</option>
                <option value={PaymentMethod.cash}>Cash</option>
                <option value={PaymentMethod.cheque}>Cheque</option>
                <option value={PaymentMethod.other}>Other</option>
              </Select>
            </ModalField>

            {/* Receipt Upload */}
            <ModalField label="Receipt / Proof (Optional)">
              <div className="flex items-center gap-2">
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent text-xs font-medium text-foreground transition-colors">
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
                  <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={proofFileName}>
                    {proofFileName}
                  </span>
                )}
              </div>
              {uploadError && (
                <p className="text-[11px] text-destructive mt-1">{uploadError}</p>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">PDF, JPG or PNG up to 10MB.</p>
            </ModalField>

            {/* Notes */}
            <ModalField label="Notes (Optional)">
              <textarea
                placeholder="Optional reference or description"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                className="block w-full min-h-[120px] rounded-lg field-focus p-4 text-foreground placeholder:text-subtle-foreground text-sm"
              />
            </ModalField>
          </ModalBody>

          <ModalFooter
            onCancel={() => {
              setIsAddPaymentOpen(false);
              resetPaymentForm();
            }}
            primaryText="Save"
            isSaving={createPaymentMutation.isPending || updatePendingMutation.isPending || isUploadingProof}
          />
        </form>
      </Modal>

      {/* Payment Details Modal */}
      <Modal
        open={Boolean(selectedPayment)}
        onOpenChange={(open) => !open && setSelectedPayment(null)}
        size="md"
      >
        {selectedPayment && (
          <>
            <ModalHeader
              title="Payment details"
              onClose={() => setSelectedPayment(null)}
            />
            <ModalBody className="space-y-4 text-xs">
              <div className="flex justify-between py-2 border-b border-border/60">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold text-foreground text-sm">
                  {formatCurrency(selectedPayment.amount)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border/60">
                <span className="text-muted-foreground">Date paid</span>
                <span className="text-foreground">{formatDateGB(selectedPayment.paymentDate)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border/60">
                <span className="text-muted-foreground">Method</span>
                <span className="text-foreground capitalize">
                  {selectedPayment.method.replace(/_/g, " ")}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border/60">
                <span className="text-muted-foreground">Status</span>
                <span>
                  {selectedPayment.status === "pending" ? (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-warning-tint border border-warning/20 text-warning">
                      Pending confirmation
                    </span>
                  ) : selectedPayment.status === "disputed" || selectedPayment.disputedByTenant ? (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-destructive-tint border border-destructive/20 text-destructive">
                      Disputed
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-success-tint border border-success/20 text-success">
                      Confirmed
                    </span>
                  )}
                </span>
              </div>

              {selectedPayment.notes && (
                <div className="pt-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Notes</span>
                  <p className="text-foreground bg-muted/40 p-3 rounded-lg border border-border/60 text-xs">
                    {selectedPayment.notes}
                  </p>
                </div>
              )}

              {selectedPayment.proofUrl && (
                <div className="pt-2 flex justify-between items-center">
                  <span className="text-muted-foreground">Receipt</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewReceipt(selectedPayment.proofUrl!)}
                    className="h-8 px-3 text-xs border-border text-primary hover:underline"
                  >
                    <Paperclip className="w-3.5 h-3.5 mr-1" />
                    View receipt
                  </Button>
                </div>
              )}
            </ModalBody>
            <ModalFooter
              primaryText="Close"
              onPrimary={() => setSelectedPayment(null)}
            />
          </>
        )}
      </Modal>

      {/* Dispute Payment Dialog */}
      <Modal
        open={isDisputeOpen}
        onOpenChange={(open) => {
          setIsDisputeOpen(open);
          if (!open) {
            setDisputeReason("");
            setDisputePaymentId(null);
          }
        }}
        isSaving={flagPaymentMutation.isPending}
        size="md"
      >
        <ModalHeader
          title="Dispute payment"
          description="If you believe this payment entry is inaccurate or was logged in error, explain the issue below. Your landlord will be notified to review and resolve the dispute."
          onClose={() => {
            setIsDisputeOpen(false);
            setDisputeReason("");
            setDisputePaymentId(null);
          }}
          isSaving={flagPaymentMutation.isPending}
        />
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (disputePaymentId && disputeReason.trim()) {
              await flagPaymentMutation.mutateAsync({
                paymentId: disputePaymentId,
                reason: disputeReason.trim(),
              });
            }
          }}
          className="flex flex-col flex-1 min-h-0"
        >
          <ModalBody className="space-y-6">
            <ModalField label="Reason for Dispute" required>
              <textarea
                required
                placeholder="Explain why this payment record is incorrect..."
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                className="block w-full min-h-[120px] rounded-lg field-focus p-4 text-foreground placeholder:text-subtle-foreground text-sm"
              />
            </ModalField>
          </ModalBody>
          <ModalFooter
            onCancel={() => {
              setIsDisputeOpen(false);
              setDisputeReason("");
              setDisputePaymentId(null);
            }}
            primaryText="Submit dispute"
            variant="destructive"
            isSaving={flagPaymentMutation.isPending}
            disabled={!disputeReason.trim()}
          />
        </form>
      </Modal>
    </div>
  );
}
