'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { PaymentMethod } from "@prisma/client";
import { X, User } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function TenantDashboard() {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Queries
  const { data: user, isLoading: isLoadingUser } = trpc.auth.me.useQuery();
  const { data: leases, isLoading: isLoadingLeases } = trpc.leases.getMine.useQuery();

  // Find the current active lease
  const activeLease = leases?.find((l) => !l.terminatedAt);

  // Payments queries
  const { data: payments, isLoading: isLoadingPayments } = trpc.payments.list.useQuery(
    { leaseId: activeLease?.id || "" },
    { enabled: !!activeLease?.id, refetchInterval: 10000 }
  );

  const { data: billingSummary } = trpc.payments.getBillingSummary.useQuery(
    { leaseId: activeLease?.id || "" },
    { enabled: !!activeLease?.id }
  );

  // Payments mutations
  const createPayment = trpc.payments.create.useMutation({
    onSuccess: () => {
      utils.payments.list.invalidate({ leaseId: activeLease?.id });
      utils.payments.getBillingSummary.invalidate({ leaseId: activeLease?.id });
      setIsLogPaymentOpen(false);
      resetPaymentForm();
    },
    onError: (err) => {
      setPaymentError(err.message);
    },
  });

  const getUploadUrlMutation = trpc.payments.getUploadUrl.useMutation();

  const acknowledgePayment = trpc.payments.acknowledge.useMutation({
    onSuccess: () => {
      utils.payments.list.invalidate({ leaseId: activeLease?.id });
    },
    onError: (err) => {
      alert(err.message);
    },
  });

  const flagPayment = trpc.payments.flag.useMutation({
    onSuccess: () => {
      utils.payments.list.invalidate({ leaseId: activeLease?.id });
      setIsFlagOpen(false);
      setFlagReason("");
      setFlagPaymentId("");
    },
    onError: (err) => {
      alert(err.message);
    },
  });

  // Tenant form states
  const [isLogPaymentOpen, setIsLogPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [paymentPeriodStart, setPaymentPeriodStart] = useState("");
  const [paymentPeriodEnd, setPaymentPeriodEnd] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.cash);
  const [paymentNotes, setPaymentNotes] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Flag/Dispute State
  const [isFlagOpen, setIsFlagOpen] = useState(false);
  const [flagPaymentId, setFlagPaymentId] = useState("");
  const [flagReason, setFlagReason] = useState("");

  // Payment Details Modal state
  const [selectedPayment, setSelectedPayment] = useState<NonNullable<typeof payments>[number] | null>(null);
  const [isPaymentDetailsOpen, setIsPaymentDetailsOpen] = useState(false);

  // Human-readable status labels
  const paymentStatusLabel: Record<string, string> = {
    confirmed: "Confirmed",
    pending: "Pending",
    disputed: "Rejected",
  };

  const resetPaymentForm = () => {
    setPaymentAmount("");
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentPeriodStart(billingSummary?.periodStart ? new Date(billingSummary.periodStart).toISOString().split("T")[0] : "");
    setPaymentPeriodEnd(billingSummary?.periodEnd ? new Date(billingSummary.periodEnd).toISOString().split("T")[0] : "");
    setPaymentMethod(PaymentMethod.cash);
    setPaymentNotes("");
    setProofUrl(null);
    setUploadError(null);
    setPaymentError(null);
  };

  const logoutMutation = trpc.auth.logout.useMutation();

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const handleDownloadAgreement = async (leaseId: string) => {
    try {
      const { signedUrl } = await utils.client.leases.getDocumentUrl.query({ leaseId });
      window.open(signedUrl, "_blank");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch document download link.";
      alert(message);
    }
  };

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeLease) return;
    setUploadError(null);

    // 10MB limit
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
        leaseId: activeLease.id,
        fileName: file.name,
      });

      const response = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to upload file to storage.");
      }

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

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      setPaymentError("Amount must be a positive number.");
      return;
    }

    if (!paymentPeriodStart || !paymentPeriodEnd) {
      setPaymentError("Period start and end dates are required.");
      return;
    }

    if (new Date(paymentPeriodStart) >= new Date(paymentPeriodEnd)) {
      setPaymentError("Period start date must be before period end date.");
      return;
    }

    try {
      await createPayment.mutateAsync({
        leaseId: activeLease!.id,
        amount,
        paymentDate: new Date(paymentDate).toISOString(),
        periodStart: new Date(paymentPeriodStart).toISOString(),
        periodEnd: new Date(paymentPeriodEnd).toISOString(),
        method: paymentMethod,
        notes: paymentNotes || undefined,
        proofUrl: proofUrl || undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to log payment.";
      setPaymentError(message);
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

  if (isLoadingUser || isLoadingLeases) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-white font-sans">
        <p className="text-lg animate-pulse">Loading lease details...</p>
      </div>
    );
  }

  // Compute status for display
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
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-white selection:text-neutral-950">
      {/* Top Navbar */}
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">
              PropLink
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-900 border border-neutral-800 text-neutral-300">
              Tenant Portal
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <Link 
              href="/tenant/profile"
              className="flex items-center space-x-2 text-sm text-neutral-400 hover:text-white transition-all group"
            >
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.fullName}
                  className="w-8 h-8 rounded-full object-cover border border-neutral-850 group-hover:border-neutral-700"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800 group-hover:border-neutral-700">
                  <User className="w-4 h-4 text-neutral-400 group-hover:text-white" />
                </div>
              )}
              <span className="hidden sm:inline font-medium">{user?.fullName || user?.email}</span>
            </Link>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="border-neutral-800 text-white hover:bg-neutral-900 text-sm h-9 px-4 transition-all"
            >
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Dashboard Space */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Welcome back, {user?.fullName || "Tenant"}
          </h1>
          <p className="text-neutral-400 mt-1 text-sm">
            Access your active lease, rental terms, and landlord-uploaded documents.
          </p>
        </div>

        {activeLease ? (
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
                      {activeLease.unit.property.address}, {activeLease.unit.property.city}, {activeLease.unit.property.state}
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
                    <span className="text-neutral-400 text-xs block mt-0.5">
                      Paid/Secured
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-neutral-950/50 text-sm">
                  <div>
                    <span className="block text-neutral-500 text-xs font-medium">Start Date</span>
                    <span className="font-semibold text-white block mt-0.5">
                      {new Date(activeLease.startDate).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="block text-neutral-500 text-xs font-medium">End Date</span>
                    <span className="font-semibold text-white block mt-0.5">
                      {new Date(activeLease.endDate).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
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
                        Your lease agreement ends on {new Date(activeLease.endDate).toLocaleDateString()}. Please contact your landlord to process your lease renewal.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Document wallet & quick info */}
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
                Need support with payments or maintenance? Landlord details and contact operations will be enabled in future releases.
              </div>
            </div>

            {/* Billing & Payments Section */}
            <div className="pt-6 border-t border-neutral-800 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Billing & Payments</h2>
                  <p className="text-neutral-400 text-sm mt-1">
                    Log new payments, track your billing period ledger, and counter-verify landlord records.
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setIsLogPaymentOpen(true);
                    setPaymentPeriodStart(billingSummary?.periodStart ? new Date(billingSummary.periodStart).toISOString().split("T")[0] : "");
                    setPaymentPeriodEnd(billingSummary?.periodEnd ? new Date(billingSummary.periodEnd).toISOString().split("T")[0] : "");
                    setPaymentAmount(billingSummary?.amountOutstanding ? String(billingSummary.amountOutstanding) : "");
                    setPaymentError(null);
                  }}
                  className="bg-white text-neutral-950 hover:bg-neutral-200 font-semibold self-start sm:self-auto"
                >
                  Log My Payment
                </Button>
              </div>

              {/* Billing Summary Banner with due-date alert */}
              {billingSummary && (
                (() => {
                  const today = new Date();
                  today.setHours(0,0,0,0);
                  const dueDate = new Date(billingSummary.periodEnd);
                  const isNearDue = (dueDate.getTime() - today.getTime()) <= 7 * 24 * 60 * 60 * 1000 && (dueDate.getTime() - today.getTime()) >= 0;
                  const isOverdue = today > dueDate && billingSummary.amountOutstanding > 0;

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl border border-neutral-800 bg-neutral-900/10 p-5">
                      <div className="space-y-1">
                        <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Next Rent Due Date</span>
                        <span className={`text-sm font-semibold block ${isOverdue ? 'text-red-400 font-semibold' : isNearDue ? 'text-yellow-400 animate-pulse' : 'text-neutral-300'}`}>
                          {dueDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                          {isOverdue && " (Overdue)"}
                          {isNearDue && " (Due soon)"}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Rent / Total Confirmed Paid</span>
                        <span className="text-lg font-bold text-white block">
                          {formatCurrency(billingSummary.rentAmount)} <span className="text-neutral-500 font-normal text-sm">/ {formatCurrency(billingSummary.amountPaid)} paid</span>
                        </span>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Outstanding Balance</span>
                        <span className={`text-lg font-bold block ${billingSummary.amountOutstanding > 0 ? 'text-red-400 font-semibold' : 'text-green-400'}`}>
                          {formatCurrency(billingSummary.amountOutstanding)}
                        </span>
                      </div>
                    </div>
                  );
                })()
              )}

              {/* Payment Ledger History */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-white">Payment Ledger</h3>
                <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/20">
                  <table className="min-w-full divide-y divide-neutral-800">
                    <thead className="bg-neutral-900/50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">Date Logged</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">Period Covered</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">Method</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">Status / Verification</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-neutral-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/60">
                      {isLoadingPayments ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-sm text-neutral-500 animate-pulse">
                            Loading ledger entries...
                          </td>
                        </tr>
                      ) : !payments || payments.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-sm text-neutral-500 italic">
                            No payments logged yet.
                          </td>
                        </tr>
                      ) : (
                        payments.map((p) => {
                          const isLandlordLogged = p.recordedByRole === "landlord";
                          const isPendingAck = isLandlordLogged && !p.counterVerifiedAt && !p.disputedByTenant;
                          return (
                            <tr key={p.id} className="hover:bg-neutral-900/10 transition-colors">
                              <td className="px-6 py-4 text-sm text-neutral-300">
                                {new Date(p.paymentDate).toLocaleDateString()}
                                {p.notes && (
                                  <span className="block text-xs text-neutral-500 mt-0.5 truncate max-w-xs" title={p.notes}>
                                    Note: {p.notes}
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-sm font-semibold text-white">
                                {formatCurrency(p.amount)}
                              </td>
                              <td className="px-6 py-4 text-sm text-neutral-400">
                                {new Date(p.periodStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {new Date(p.periodEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </td>
                              <td className="px-6 py-4 text-sm text-neutral-400 capitalize">
                                {p.method.replace('_', ' ')}
                              </td>
                              <td className="px-6 py-4 text-sm">
                                <div className="flex flex-col space-y-1">
                                  <div className="flex items-center space-x-2">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize border ${
                                      p.status === "confirmed"
                                        ? "bg-green-950/30 text-green-400 border-green-900/30"
                                        : p.status === "disputed"
                                        ? "bg-red-950/30 text-red-400 border-red-900/30"
                                        : "bg-yellow-950/30 text-yellow-400 border-yellow-900/30"
                                    }`}>
                                      {p.status}
                                    </span>
                                    {p.proofUrl && (
                                      <button
                                        onClick={() => handleViewPaymentProof(p.proofUrl!)}
                                        className="text-xs text-neutral-400 hover:text-white underline ml-2"
                                      >
                                        View Proof
                                      </button>
                                    )}
                                  </div>
                                  {p.counterVerifiedAt && (
                                    <span className="text-[11px] text-green-500 font-medium">
                                      ✓ You Acknowledged
                                    </span>
                                  )}
                                  {p.disputedByTenant && !p.disputedByResolvedAt && (
                                    <span className="text-[11px] text-red-400 font-medium bg-red-950/20 border border-red-900/30 rounded p-1.5 mt-1 block">
                                      ⚠️ You Disputed: {p.disputedByReason}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-sm text-right">
                                {isPendingAck ? (
                                  <div className="flex items-center justify-end space-x-2">
                                    <Button
                                      onClick={() => acknowledgePayment.mutate({ paymentId: p.id })}
                                      disabled={acknowledgePayment.isPending}
                                      size="sm"
                                      className="bg-green-600 hover:bg-green-500 text-white h-8 text-xs font-semibold px-3"
                                    >
                                      Acknowledge
                                    </Button>
                                    <Button
                                      onClick={() => {
                                        setFlagPaymentId(p.id);
                                        setFlagReason("");
                                        setIsFlagOpen(true);
                                      }}
                                      variant="outline"
                                      size="sm"
                                      className="border-neutral-800 text-red-400 hover:bg-red-950/20 hover:border-red-900/30 h-8 text-xs font-semibold px-3"
                                    >
                                      Flag Incorrect
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    onClick={() => {
                                      setSelectedPayment(p);
                                      setIsPaymentDetailsOpen(true);
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className="border-neutral-800 text-neutral-300 hover:bg-neutral-900 h-8 text-xs font-semibold px-3"
                                  >
                                    Details
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-12 text-center max-w-xl mx-auto space-y-4">
            <h3 className="text-lg font-medium text-white">No active lease found</h3>
            <p className="text-neutral-400 text-sm">
              Your account has successfully registered, but is not currently linked to an active tenancy. Please contact your landlord to request an invitation.
            </p>
          </div>
        )}

        {/* Billing & Payments Section — full width, outside the 3-col grid */}
        {activeLease && (
          <div className="pt-6 border-t border-neutral-800 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Billing &amp; Payments</h2>
                <p className="text-neutral-400 text-sm mt-1">
                  Log new payments, track your billing period ledger, and counter-verify landlord records.
                </p>
              </div>
              <Button
                onClick={() => {
                  setIsLogPaymentOpen(true);
                  setPaymentPeriodStart(billingSummary?.periodStart ? new Date(billingSummary.periodStart).toISOString().split("T")[0] : "");
                  setPaymentPeriodEnd(billingSummary?.periodEnd ? new Date(billingSummary.periodEnd).toISOString().split("T")[0] : "");
                  setPaymentAmount(billingSummary?.amountOutstanding ? String(billingSummary.amountOutstanding) : "");
                  setPaymentError(null);
                }}
                className="bg-white text-neutral-950 hover:bg-neutral-200 font-semibold self-start sm:self-auto"
              >
                Log My Payment
              </Button>
            </div>

            {/* Billing Summary Banner */}
            {billingSummary && (
              (() => {
                const today = new Date();
                today.setHours(0,0,0,0);
                const dueDate = new Date(billingSummary.periodEnd);
                const isNearDue = (dueDate.getTime() - today.getTime()) <= 7 * 24 * 60 * 60 * 1000 && (dueDate.getTime() - today.getTime()) >= 0;
                const isOverdue = today > dueDate && billingSummary.amountOutstanding > 0;

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl border border-neutral-800 bg-neutral-900/10 p-5">
                    <div className="space-y-1">
                      <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Next Rent Due Date</span>
                      <span className={`text-sm font-semibold block ${isOverdue ? 'text-red-400 font-semibold' : isNearDue ? 'text-yellow-400 animate-pulse' : 'text-neutral-300'}`}>
                        {dueDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                        {isOverdue && " (Overdue)"}
                        {isNearDue && " (Due soon)"}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Rent / Total Confirmed Paid</span>
                      <span className="text-lg font-bold text-white block">
                        {formatCurrency(billingSummary.rentAmount)} <span className="text-neutral-500 font-normal text-sm">/ {formatCurrency(billingSummary.amountPaid)} paid</span>
                      </span>
                    </div>
                    <div className="space-y-1">
                      <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Outstanding Balance</span>
                      <span className={`text-lg font-bold block ${billingSummary.amountOutstanding > 0 ? 'text-red-400 font-semibold' : 'text-green-400'}`}>
                        {formatCurrency(billingSummary.amountOutstanding)}
                      </span>
                    </div>
                  </div>
                );
              })()
            )}

            {/* Payment Ledger Table */}
            <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/20">
              <table className="min-w-full divide-y divide-neutral-800">
                <thead className="bg-neutral-900/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">Date Logged</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">Period Covered</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">Method</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">Status / Verification</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-neutral-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {isLoadingPayments ? (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-sm text-neutral-500 animate-pulse">Loading ledger entries...</td></tr>
                  ) : !payments || payments.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-sm text-neutral-500 italic">No payments logged yet.</td></tr>
                  ) : (
                    payments.map((p) => {
                      const isLandlordLogged = p.recordedByRole === "landlord";
                      const isPendingAck = isLandlordLogged && !p.counterVerifiedAt && !p.disputedByTenant;
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
                          <td className="px-6 py-4 text-sm text-neutral-400">
                            {new Date(p.periodStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {new Date(p.periodEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="px-6 py-4 text-sm text-neutral-400 capitalize">
                            {p.method.replace('_', ' ')}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <div className="flex flex-col space-y-1">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border w-fit ${
                                p.status === "confirmed"
                                  ? "bg-green-950/30 text-green-400 border-green-900/30"
                                  : p.status === "disputed"
                                  ? "bg-red-950/30 text-red-400 border-red-900/30"
                                  : "bg-yellow-950/30 text-yellow-400 border-yellow-900/30"
                              }`}>
                                {paymentStatusLabel[p.status] ?? p.status}
                              </span>
                              {p.counterVerifiedAt && (
                                <span className="text-[11px] text-green-500 font-medium">✓ You Acknowledged</span>
                              )}
                              {p.disputedByTenant && !p.disputedByResolvedAt && (
                                <span className="text-[11px] text-red-400 font-medium bg-red-950/20 border border-red-900/30 rounded p-1.5 mt-1 block">
                                  ⚠️ You Disputed: {p.disputedByReason}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-right" onClick={(e) => e.stopPropagation()}>
                            {isPendingAck ? (
                              <div className="flex items-center justify-end space-x-2">
                                <Button
                                  onClick={() => acknowledgePayment.mutate({ paymentId: p.id })}
                                  disabled={acknowledgePayment.isPending}
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-500 text-white h-8 text-xs font-semibold px-3"
                                >
                                  Acknowledge
                                </Button>
                                <Button
                                  onClick={() => { setFlagPaymentId(p.id); setFlagReason(""); setIsFlagOpen(true); }}
                                  variant="outline"
                                  size="sm"
                                  className="border-neutral-800 text-red-400 hover:bg-red-950/20 hover:border-red-900/30 h-8 text-xs font-semibold px-3"
                                >
                                  Flag Incorrect
                                </Button>
                              </div>
                            ) : (
                              <Button
                                onClick={() => { setSelectedPayment(p); setIsPaymentDetailsOpen(true); }}
                                variant="outline"
                                size="sm"
                                className="border-neutral-800 text-neutral-300 hover:bg-neutral-900 h-8 text-xs font-semibold px-3"
                              >
                                Details
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      {/* Log Payment Modal */}
      {isLogPaymentOpen && activeLease && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl my-8">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-neutral-800">
              <h2 className="text-xl font-bold text-white font-sans">Log My Payment</h2>
              <button
                onClick={() => {
                  setIsLogPaymentOpen(false);
                  resetPaymentForm();
                }}
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
                  type="number"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                  placeholder="e.g. 150000"
                />
              </div>

              <div>
                <label htmlFor="paymentDate" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Payment Date
                </label>
                <input
                  id="paymentDate"
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="paymentPeriodStart" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Period Start
                  </label>
                  <input
                    id="paymentPeriodStart"
                    type="date"
                    required
                    value={paymentPeriodStart}
                    onChange={(e) => setPaymentPeriodStart(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                  />
                </div>
                <div>
                  <label htmlFor="paymentPeriodEnd" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Period End
                  </label>
                  <input
                    id="paymentPeriodEnd"
                    type="date"
                    required
                    value={paymentPeriodEnd}
                    onChange={(e) => setPaymentPeriodEnd(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="paymentMethod" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Payment Method
                </label>
                <select
                  id="paymentMethod"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                >
                  <option value={PaymentMethod.cash}>Cash</option>
                  <option value={PaymentMethod.bank_transfer}>Bank Transfer</option>
                  <option value={PaymentMethod.cheque}>Cheque</option>
                  <option value={PaymentMethod.other}>Other</option>
                </select>
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

              {/* Payment Proof File Upload */}
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
                  {uploadError && (
                    <p className="text-xs text-red-400 font-sans">{uploadError}</p>
                  )}
                  {uploadingProof && (
                    <p className="text-xs text-neutral-400 animate-pulse">Uploading file...</p>
                  )}
                  {proofUrl && (
                    <p className="text-xs text-green-400 font-sans">✓ Proof uploaded successfully: {proofUrl.split("/").pop()}</p>
                  )}
                </div>
              </div>

              <div className="flex space-x-3 mt-6 pt-4 border-t border-neutral-800">
                <Button
                  type="button"
                  onClick={() => {
                    setIsLogPaymentOpen(false);
                    resetPaymentForm();
                  }}
                  variant="outline"
                  className="w-1/2 border-neutral-800 text-white hover:bg-neutral-900 h-10 text-sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createPayment.isPending || uploadingProof}
                  className="w-1/2 bg-white text-neutral-950 hover:bg-neutral-200 h-10 text-sm font-semibold"
                >
                  {createPayment.isPending ? "Logging..." : "Log Payment"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Flag Incorrect Payment Modal */}
      {isFlagOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-neutral-800">
              <h2 className="text-lg font-bold text-white font-sans">Flag Payment as Incorrect</h2>
              <button
                onClick={() => {
                  setIsFlagOpen(false);
                  setFlagReason("");
                  setFlagPaymentId("");
                }}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!flagReason.trim()) {
                  alert("Reason is required.");
                  return;
                }
                await flagPayment.mutateAsync({
                  paymentId: flagPaymentId,
                  reason: flagReason,
                });
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
                  placeholder="Explain why this landlord-logged payment is incorrect (e.g. wrong amount, wrong date)..."
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <Button
                  type="button"
                  onClick={() => {
                    setIsFlagOpen(false);
                    setFlagReason("");
                    setFlagPaymentId("");
                  }}
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

      {/* Payment Details Modal */}
      {isPaymentDetailsOpen && selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-neutral-800">
              <h2 className="text-xl font-bold text-white font-sans">Payment Details</h2>
              <button
                onClick={() => {
                  setIsPaymentDetailsOpen(false);
                  setSelectedPayment(null);
                }}
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
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                      selectedPayment.status === "confirmed"
                        ? "bg-green-950/30 text-green-400 border-green-900/30"
                        : selectedPayment.status === "disputed"
                        ? "bg-red-950/30 text-red-400 border-red-900/30"
                        : "bg-yellow-950/30 text-yellow-400 border-yellow-900/30"
                    }`}>
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
                    {selectedPayment.method.replace('_', ' ')}
                  </span>
                </div>
              </div>

              <div>
                <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Period Covered</span>
                <span className="text-neutral-300 mt-1 block">
                  {new Date(selectedPayment.periodStart).toLocaleDateString()} – {new Date(selectedPayment.periodEnd).toLocaleDateString()}
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

              {selectedPayment.proofUrl && (
                <div>
                  <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Proof Document</span>
                  <button
                    onClick={() => handleViewPaymentProof(selectedPayment.proofUrl!)}
                    className="mt-2 inline-flex items-center text-xs text-white hover:underline bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-neutral-800"
                  >
                    View / Download Proof
                  </button>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-neutral-800">
              <Button
                onClick={() => {
                  setIsPaymentDetailsOpen(false);
                  setSelectedPayment(null);
                }}
                className="w-full bg-white text-neutral-950 hover:bg-neutral-200 font-semibold h-[38px]"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  );
}
