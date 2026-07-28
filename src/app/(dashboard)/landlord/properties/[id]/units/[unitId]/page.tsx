'use client';

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { RentFrequency, PaymentMethod } from "@prisma/client";
import { X, User } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { isResidentialUnitType, getUnitTypesByPropertyType } from "@/lib/unit-types";
import { formatCurrency } from "@/lib/utils";

export default function UnitDetailPage() {
  const router = useRouter();
  const params = useParams();
  const propertyId = params.id as string;
  const unitId = params.unitId as string;
  const utils = trpc.useUtils();

  // Queries
  const { data: properties } = trpc.properties.list.useQuery();
  const { data: unitStatus, isLoading: isLoadingStatus } = trpc.units.getStatus.useQuery({ id: unitId });
  const { data: leases, isLoading: isLoadingLeases } = trpc.leases.getForUnit.useQuery({ unitId });

  // Find unit details from properties list
  const property = properties?.find((p) => p.id === propertyId);
  const unit = property?.units.find((u) => u.id === unitId);

  // Active Lease if exists
  const activeLease = leases?.find((l) => !l.terminatedAt);

  // Timeline query
  const { data: timeline } = trpc.leases.getTimeline.useQuery(
    { leaseId: activeLease?.id || "" },
    { enabled: !!activeLease?.id }
  );

  // Mutations
  const createLease = trpc.leases.create.useMutation({
    onSuccess: () => {
      utils.leases.getForUnit.invalidate({ unitId });
      utils.units.getStatus.invalidate({ id: unitId });
      utils.properties.list.invalidate();
      setIsAddLeaseOpen(false);
      resetLeaseForm();
    },
    onError: (err) => {
      setLeaseError(err.message);
    },
  });

  const renewLease = trpc.leases.renew.useMutation({
    onSuccess: () => {
      utils.leases.getForUnit.invalidate({ unitId });
      utils.units.getStatus.invalidate({ id: unitId });
      utils.properties.list.invalidate();
      if (activeLease) {
        utils.leases.getTimeline.invalidate({ leaseId: activeLease.id });
      }
      setIsRenewLeaseOpen(false);
      resetRenewForm();
    },
    onError: (err) => {
      setRenewError(err.message);
    },
  });

  const uploadDocMutation = trpc.leases.uploadDocument.useMutation();

  const [isEditLeaseOpen, setIsEditLeaseOpen] = useState(false);
  const [editRentAmount, setEditRentAmount] = useState("");
  const [editRentFrequency, setEditRentFrequency] = useState<RentFrequency>(RentFrequency.annually);
  const [editDepositAmount, setEditDepositAmount] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editLeaseError, setEditLeaseError] = useState<string | null>(null);

  const updateLease = trpc.leases.update.useMutation({
    onSuccess: () => {
      utils.leases.getForUnit.invalidate({ unitId });
      utils.units.getStatus.invalidate({ id: unitId });
      utils.properties.list.invalidate();
      if (activeLease) {
        utils.leases.getTimeline.invalidate({ leaseId: activeLease.id });
        utils.payments.getBillingSummary.invalidate({ leaseId: activeLease.id });
      }
      setIsEditLeaseOpen(false);
    },
    onError: (err) => {
      setEditLeaseError(err.message);
    },
  });

  const handleOpenEditLease = () => {
    if (activeLease) {
      setEditRentAmount(Number(activeLease.rentAmount) === 0 ? "" : activeLease.rentAmount.toString());
      setEditRentFrequency(activeLease.rentFrequency);
      setEditDepositAmount(activeLease.depositAmount ? activeLease.depositAmount.toString() : "");
      setEditStartDate(new Date(activeLease.startDate).toISOString().split("T")[0]);
      setEditEndDate(new Date(activeLease.endDate).toISOString().split("T")[0]);
      setEditLeaseError(null);
      setIsEditLeaseOpen(true);
    }
  };

  const handleEditStartDateChange = (val: string) => {
    setEditStartDate(val);
    if (unit && isResidentialUnitType(unit.unitType) && val) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        d.setFullYear(d.getFullYear() + 1);
        setEditEndDate(d.toISOString().split("T")[0]);
      }
    }
  };

  const handleUpdateLeaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditLeaseError(null);

    const rent = editRentAmount ? parseFloat(editRentAmount) : 0;
    const deposit = editDepositAmount ? parseFloat(editDepositAmount) : null;

    if (editRentAmount && (isNaN(rent) || rent < 0)) {
      setEditLeaseError("Rent amount must be a positive number.");
      return;
    }

    try {
      await updateLease.mutateAsync({
        id: activeLease!.id,
        startDate: editStartDate,
        endDate: editEndDate,
        rentAmount: rent,
        rentFrequency: editRentFrequency,
        depositAmount: deposit,
      });
    } catch {
      // handled
    }
  };

  // Unit edit / delete states and actions
  const [isEditUnitOpen, setIsEditUnitOpen] = useState(false);
  const [editUnitNumber, setEditUnitNumber] = useState("");
  const [editUnitType, setEditUnitType] = useState("");
  const [editRoomsCount, setEditRoomsCount] = useState("");
  const [editUnitError, setEditUnitError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const allowedUnitTypes = property ? getUnitTypesByPropertyType(property.propertyType) : [];

  const updateUnit = trpc.units.update.useMutation({
    onSuccess: () => {
      utils.units.listByProperty.invalidate({ propertyId });
      utils.properties.list.invalidate();
      utils.units.getStatus.invalidate({ id: unitId });
      setIsEditUnitOpen(false);
      setEditUnitError(null);
    },
    onError: (err) => {
      setEditUnitError(err.message);
    },
  });

  const deleteUnit = trpc.units.delete.useMutation({
    onSuccess: () => {
      utils.units.listByProperty.invalidate({ propertyId });
      utils.properties.list.invalidate();
      router.push(`/landlord/properties/${propertyId}`);
    },
    onError: (err) => {
      setDeleteError(err.message);
    },
  });

  const handleOpenEditUnit = () => {
    if (unit) {
      setEditUnitNumber(unit.unitNumber);
      setEditUnitType(unit.unitType);
      setEditRoomsCount(unit.roomsCount ? unit.roomsCount.toString() : "");
      setEditUnitError(null);
      setIsEditUnitOpen(true);
    }
  };

  const handleUpdateUnitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditUnitError(null);

    try {
      await updateUnit.mutateAsync({
        id: unitId,
        unitNumber: editUnitNumber,
        unitType: editUnitType,
        roomsCount: isResidentialUnitType(editUnitType) && editRoomsCount ? parseInt(editRoomsCount, 10) : null,
      });
    } catch {
      // handled
    }
  };

  const handleDeleteUnit = async () => {
    setDeleteError(null);
    if (confirm("Are you sure you want to delete this unit? This action is permanent.")) {
      try {
        await deleteUnit.mutateAsync({ id: unitId });
      } catch {
        // handled
      }
    }
  };

  // Payments queries
  const { data: payments, isLoading: isLoadingPayments } = trpc.payments.list.useQuery(
    { leaseId: activeLease?.id || "" },
    { enabled: !!activeLease?.id }
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

  const confirmPayment = trpc.payments.confirm.useMutation({
    onSuccess: () => {
      utils.payments.list.invalidate({ leaseId: activeLease?.id });
      utils.payments.getBillingSummary.invalidate({ leaseId: activeLease?.id });
    },
    onError: (err) => {
      alert(err.message);
    },
  });

  const rejectPayment = trpc.payments.reject.useMutation({
    onSuccess: () => {
      utils.payments.list.invalidate({ leaseId: activeLease?.id });
      utils.payments.getBillingSummary.invalidate({ leaseId: activeLease?.id });
      setIsRejectOpen(false);
      setRejectReason("");
      setRejectPaymentId("");
    },
    onError: (err) => {
      alert(err.message);
    },
  });

  const resolvePayment = trpc.payments.resolve.useMutation({
    onSuccess: () => {
      utils.payments.list.invalidate({ leaseId: activeLease?.id });
      utils.payments.getBillingSummary.invalidate({ leaseId: activeLease?.id });
      setIsEditOpen(false);
      resetEditForm();
    },
    onError: (err) => {
      alert(err.message);
    },
  });

  // States
  const [isAddLeaseOpen, setIsAddLeaseOpen] = useState(false);

  // Payment Ledger States
  const [isLogPaymentOpen, setIsLogPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [paymentPeriodStart, setPaymentPeriodStart] = useState("");
  const [paymentPeriodEnd, setPaymentPeriodEnd] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.cash);
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Reject State
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectPaymentId, setRejectPaymentId] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  // Edit/Resolve State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editPaymentId, setEditPaymentId] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editPaymentDate, setEditPaymentDate] = useState("");
  const [editMethod, setEditMethod] = useState<PaymentMethod>(PaymentMethod.cash);
  const [editAction, setEditAction] = useState<"edit" | "void">("edit");
  const [tenantName, setTenantName] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rentAmount, setRentAmount] = useState("");
  const [rentFrequency, setRentFrequency] = useState<RentFrequency>(RentFrequency.monthly);
  const [depositAmount, setDepositAmount] = useState("");
  const [leaseError, setLeaseError] = useState<string | null>(null);

  // File Upload State
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Copy Invitation States
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Landlord payment detail modal
  const [selectedLandlordPayment, setSelectedLandlordPayment] = useState<NonNullable<typeof payments>[number] | null>(null);
  const [isLandlordPaymentDetailOpen, setIsLandlordPaymentDetailOpen] = useState(false);

  // Human-readable status labels
  const paymentStatusLabel: Record<string, string> = {
    confirmed: "Confirmed",
    pending: "Pending",
    disputed: "Rejected",
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = (code: string) => {
    const signupLink = `${window.location.origin}/signup?code=${code}`;
    navigator.clipboard.writeText(signupLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (unit && isResidentialUnitType(unit.unitType) && val) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        d.setFullYear(d.getFullYear() + 1);
        setEndDate(d.toISOString().split("T")[0]);
      }
    }
  };

  const resetLeaseForm = () => {
    setTenantName("");
    setTenantEmail("");
    setStartDate("");
    setEndDate("");
    setRentAmount("");
    setRentFrequency(RentFrequency.monthly);
    setDepositAmount("");
    setLeaseError(null);
  };

  // Renew Lease State
  const [isRenewLeaseOpen, setIsRenewLeaseOpen] = useState(false);
  const [renewStartDate, setRenewStartDate] = useState("");
  const [renewEndDate, setRenewEndDate] = useState("");
  const [renewRentAmount, setRenewRentAmount] = useState("");
  const [renewRentFrequency, setRenewRentFrequency] = useState<RentFrequency>(RentFrequency.annually);
  const [renewDepositAmount, setRenewDepositAmount] = useState("");
  const [renewError, setRenewError] = useState<string | null>(null);

  const resetRenewForm = () => {
    setRenewStartDate("");
    setRenewEndDate("");
    setRenewRentAmount("");
    setRenewRentFrequency(RentFrequency.annually);
    setRenewDepositAmount("");
    setRenewError(null);
  };

  const handleOpenRenewLease = () => {
    if (!activeLease) return;
    // Default start = old endDate + 1 day
    const oldEnd = new Date(activeLease.endDate);
    oldEnd.setDate(oldEnd.getDate() + 1);
    const newStart = oldEnd.toISOString().split("T")[0];
    setRenewStartDate(newStart);
    // Auto-calc end date for residential units
    if (unit && isResidentialUnitType(unit.unitType)) {
      const newEnd = new Date(oldEnd);
      newEnd.setFullYear(newEnd.getFullYear() + 1);
      setRenewEndDate(newEnd.toISOString().split("T")[0]);
    } else {
      setRenewEndDate("");
    }
    setRenewRentAmount(Number(activeLease.rentAmount) === 0 ? "" : activeLease.rentAmount.toString());
    setRenewRentFrequency(activeLease.rentFrequency);
    setRenewDepositAmount(activeLease.depositAmount ? activeLease.depositAmount.toString() : "");
    setRenewError(null);
    setIsRenewLeaseOpen(true);
  };

  const handleRenewStartDateChange = (val: string) => {
    setRenewStartDate(val);
    if (unit && isResidentialUnitType(unit.unitType) && val) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        d.setFullYear(d.getFullYear() + 1);
        setRenewEndDate(d.toISOString().split("T")[0]);
      }
    }
  };

  const handleRenewLeaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRenewError(null);

    const rent = renewRentAmount ? parseFloat(renewRentAmount) : 0;
    const deposit = renewDepositAmount ? parseFloat(renewDepositAmount) : null;

    if (renewRentAmount && (isNaN(rent) || rent < 0)) {
      setRenewError("Rent amount must be a positive number.");
      return;
    }
    if (renewDepositAmount && (isNaN(deposit!) || deposit! <= 0)) {
      setRenewError("Deposit amount must be a positive number.");
      return;
    }
    if (!renewEndDate) {
      setRenewError("End date is required.");
      return;
    }

    try {
      await renewLease.mutateAsync({
        sourceLeaseId: activeLease!.id,
        startDate: renewStartDate,
        endDate: renewEndDate,
        rentAmount: rent,
        rentFrequency: renewRentFrequency,
        depositAmount: deposit,
        renewalWindowDays: activeLease!.renewalWindowDays ?? 60,
      });
    } catch {
      // handled by onError
    }
  };

  const resetPaymentForm = () => {
    setPaymentAmount("");
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentPeriodStart(billingSummary?.periodStart ? new Date(billingSummary.periodStart).toISOString().split("T")[0] : "");
    setPaymentPeriodEnd(billingSummary?.periodEnd ? new Date(billingSummary.periodEnd).toISOString().split("T")[0] : "");
    setPaymentMethod(PaymentMethod.cash);
    setPaymentNotes("");
    setPaymentError(null);
  };

  const resetEditForm = () => {
    setEditPaymentId("");
    setEditAmount("");
    setEditPaymentDate("");
    setEditMethod(PaymentMethod.cash);
    setEditAction("edit");
  };

  const handleCreateLease = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeaseError(null);

    const rent = rentAmount ? parseFloat(rentAmount) : undefined;
    const deposit = depositAmount ? parseFloat(depositAmount) : undefined;

    if (rentAmount && (isNaN(rent!) || rent! < 0)) {
      setLeaseError("Rent amount must be a positive number.");
      return;
    }
    if (depositAmount && (isNaN(deposit!) || deposit! <= 0)) {
      setLeaseError("Deposit amount must be a positive number.");
      return;
    }

    try {
      await createLease.mutateAsync({
        unitId,
        tenantName,
        tenantEmail,
        startDate,
        endDate,
        rentAmount: rent,
        rentFrequency,
        depositAmount: deposit,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create lease.";
      setLeaseError(message);
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
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to log payment.";
      setPaymentError(message);
    }
  };

  const handleEditPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(editAmount);
    if (editAction === "edit" && (isNaN(amount) || amount <= 0)) {
      alert("Amount must be a positive number.");
      return;
    }

    try {
      await resolvePayment.mutateAsync({
        paymentId: editPaymentId,
        action: editAction,
        amount: editAction === "edit" ? amount : undefined,
        paymentDate: editAction === "edit" ? new Date(editPaymentDate).toISOString() : undefined,
        method: editAction === "edit" ? editMethod : undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to resolve payment.";
      alert(message);
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeLease) return;
    setUploadError(null);

    // 10MB limit
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File size exceeds 10MB limit.");
      return;
    }

    // PDF/Image only
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setUploadError("Only PDF and image files are allowed.");
      return;
    }

    setUploading(true);

    try {
      // 1. Get signed upload URL from server
      const { signedUrl } = await uploadDocMutation.mutateAsync({
        leaseId: activeLease.id,
        fileName: file.name,
      });

      // 2. Upload file directly to Supabase Storage via signed URL
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

      // 3. Refresh lease details to reflect documentUrl in UI
      utils.leases.getForUnit.invalidate({ unitId });
      alert("Lease agreement uploaded successfully!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred during file upload.";
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  };

  const handleViewDocument = async () => {
    if (!activeLease) return;
    try {
      const { signedUrl } = await utils.client.leases.getDocumentUrl.query({
        leaseId: activeLease.id,
      });
      window.open(signedUrl, "_blank");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch document link.";
      alert(message);
    }
  };

  if (isLoadingStatus || isLoadingLeases) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-white">
        <p className="text-lg">Loading unit details...</p>
      </div>
    );
  }

  if (!property || !unit) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 text-white">
        <p className="text-lg">Unit not found.</p>
        <Link href="/landlord/properties" className="text-sm underline mt-2">
          Back to properties
        </Link>
      </div>
    );
  }

  // Visual Timeline math
  let todayPercent = 0;
  let renewalPercent = 0;

  if (timeline) {
    const startMs = new Date(timeline.startDate).getTime();
    const endMs = new Date(timeline.endDate).getTime();
    const todayMs = new Date().getTime();

    const totalDuration = endMs - startMs;
    const elapsed = Math.max(0, Math.min(totalDuration, todayMs - startMs));
    todayPercent = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;

    const renewalStartDateMs = new Date(timeline.renewalStartDate).getTime();
    const renewalDuration = endMs - renewalStartDateMs;
    renewalPercent = totalDuration > 0 ? (renewalDuration / totalDuration) * 100 : 0;
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Top Navbar */}
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4 ml-10 md:ml-0">
            <Link href="/landlord" className="text-xl font-bold tracking-tight text-white hover:opacity-90">
              PropLink
            </Link>
            <span className="text-neutral-500">/</span>
            <Link
              href={`/landlord/properties/${propertyId}`}
              className="text-sm font-medium text-neutral-400 hover:text-white transition-colors"
            >
              {property.name}
            </Link>
            <span className="text-neutral-500">/</span>
            <span className="text-sm font-medium text-neutral-300">Unit {unit.unitNumber}</span>
          </div>

          <div className="flex items-center space-x-3">
            <Button
              onClick={handleOpenEditUnit}
              variant="outline"
              className="border-neutral-800 text-white hover:bg-neutral-900 h-9 px-4 text-sm"
            >
              Edit Unit
            </Button>
            <Button
              onClick={handleDeleteUnit}
              variant="outline"
              className="border-neutral-800 text-red-400 hover:bg-red-950/20 hover:text-red-300 h-9 px-4 text-sm"
            >
              Delete Unit
            </Button>
            {!activeLease && (
              <Button
                onClick={() => setIsAddLeaseOpen(true)}
                className="bg-white text-neutral-950 hover:bg-neutral-200 h-9 px-4 text-sm"
              >
                Invite Tenant
              </Button>
            )}
            {timeline && (timeline.status === "active" || timeline.status === "renewal_due") && (
              <Button
                onClick={handleOpenRenewLease}
                className="bg-emerald-700 hover:bg-emerald-600 text-white h-9 px-4 text-sm font-semibold"
              >
                Renew Lease
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <BackButton href={`/landlord/properties/${propertyId}`} label="Back to Property" />
        {deleteError && (
          <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-4 text-sm text-red-400">
            {deleteError}
          </div>
        )}
        {/* Unit Info Card */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-6 backdrop-blur-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-3xl font-extrabold tracking-tight">Unit {unit.unitNumber}</h1>
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                  unitStatus?.status === "occupied"
                    ? "bg-green-950/30 text-green-400 border border-green-900/30"
                    : "bg-yellow-950/30 text-yellow-400 border border-yellow-900/30"
                }`}
              >
                {unitStatus?.status}
              </span>
            </div>
            <p className="text-neutral-400 text-sm mt-1 capitalize">
              {unit.unitType} {unit.sizeSqm ? `• ${unit.sizeSqm} sqm` : ""}
            </p>
          </div>

          {activeLease ? (
            <div className="border-t md:border-t-0 md:border-l border-neutral-800 pt-4 md:pt-0 md:pl-6 flex flex-col space-y-1.5 min-w-[250px]">
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Current Tenant</span>
              <div className="flex items-center space-x-2">
                {activeLease.tenant.avatarUrl ? (
                  <img
                    src={activeLease.tenant.avatarUrl}
                    alt={activeLease.tenant.fullName}
                    className="w-6 h-6 rounded-full object-cover border border-neutral-700"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center border border-neutral-750">
                    <User className="w-3 h-3 text-neutral-400" />
                  </div>
                )}
                <span className="text-sm font-semibold text-white">{activeLease.tenant.fullName}</span>
              </div>
              <div className="text-xs text-neutral-400 space-y-0.5">
                <p className="truncate">Email: {activeLease.tenant.email}</p>
                <p>Phone: {activeLease.tenant.phone || "—"}</p>
              </div>
            </div>
          ) : (
            <div className="border-t md:border-t-0 md:border-l border-neutral-800 pt-4 md:pt-0 md:pl-6 flex flex-col space-y-1 min-w-[200px]">
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Current Tenant</span>
              <p className="text-sm text-neutral-500 italic">Vacant, no active tenant</p>
            </div>
          )}
        </div>

        {/* Active Lease Section */}
        {activeLease && timeline ? (
          <div className="space-y-6">
            <h2 className="text-xl font-bold tracking-tight">Active Tenancy</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Timeline Display Card */}
              <div className="md:col-span-2 rounded-xl border border-neutral-800 bg-neutral-900/20 p-6 space-y-6">
                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-3">
                    <h3 className="font-bold text-white text-lg">Lease Timeline</h3>
                    <button
                      onClick={handleOpenEditLease}
                      className="text-xs text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 hover:border-neutral-700 px-2 py-1 rounded transition-colors"
                    >
                      Edit Details
                    </button>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                      timeline.status === "renewal_due"
                        ? "bg-yellow-950/30 text-yellow-400 border border-yellow-900/30 animate-pulse"
                        : "bg-green-950/30 text-green-400 border border-green-900/30"
                    }`}
                  >
                    {timeline.status.replace("_", " ")}
                  </span>
                </div>

                {/* Progress Visual Tracker */}
                <div className="space-y-3 pt-4">
                  <div className="relative w-full h-3 rounded-full bg-neutral-800 overflow-visible">
                    {/* Renewal window highlights */}
                    <div
                      className="absolute top-0 bottom-0 right-0 bg-yellow-950/60 border-l border-yellow-800 rounded-r-full"
                      style={{ width: `${renewalPercent}%` }}
                    />
                    {/* Elapsed progress tracker */}
                    <div
                      className="absolute top-0 bottom-0 left-0 bg-neutral-600 rounded-l-full"
                      style={{ width: `${todayPercent}%` }}
                    />
                    {/* Current day marker dot */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 border-white bg-white shadow-md cursor-pointer transition-transform hover:scale-110"
                      style={{ left: `calc(${todayPercent}% - 10px)` }}
                      title="Today"
                    />
                  </div>

                  <div className="flex justify-between text-xs text-neutral-500 font-medium pt-1">
                    <span>Start: {new Date(timeline.startDate).toLocaleDateString()}</span>
                    <span
                      style={{ marginRight: `${renewalPercent / 2}%` }}
                      className="text-yellow-500 font-semibold"
                    >
                      Renewal Window
                    </span>
                    <span>End: {new Date(timeline.endDate).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Summary details */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-neutral-800/40 text-sm">
                  <div>
                    <span className="block text-neutral-500 text-xs">Tenant</span>
                    <span className="font-semibold text-white mt-0.5 block">{timeline.tenantName}</span>
                  </div>
                  <div>
                    <span className="block text-neutral-500 text-xs">Rent</span>
                    <span className="font-semibold text-white mt-0.5 block">
                      {Number(timeline.rentAmount) === 0
                        ? "TBD"
                        : `${formatCurrency(timeline.rentAmount)} / ${timeline.rentFrequency}`}
                    </span>
                  </div>
                  <div>
                    <span className="block text-neutral-500 text-xs">Deposit</span>
                    <span className="font-semibold text-white mt-0.5 block">
                      {activeLease.depositAmount ? formatCurrency(activeLease.depositAmount) : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-neutral-500 text-xs">Invite Status</span>
                    <span className="font-semibold text-white mt-0.5 block">
                      {activeLease.inviteCodes[0] ? (
                        <span className="text-yellow-500 font-mono">
                          Invite Code: {activeLease.inviteCodes[0].code} (Awaiting Tenant)
                        </span>
                      ) : (
                        <span className="text-green-400">Claimed & Linked</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Signed Document Wallet Card */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-6 flex flex-col justify-between space-y-4">
                <div>
                  <h3 className="font-bold text-white text-lg">Digital Wallet</h3>
                  <p className="text-neutral-500 text-xs mt-1">
                    Store and view lease agreements. Accepts PDF and image files, max 10MB.
                  </p>

                  {uploadError && (
                    <div className="mt-3 rounded bg-red-950/20 border border-red-900/30 p-2.5 text-xs text-red-400">
                      {uploadError}
                    </div>
                  )}

                  {activeLease.documentUrl ? (
                    <div className="mt-4 p-3 rounded-lg border border-neutral-800 bg-neutral-900/40 flex items-center justify-between">
                      <div className="flex items-center space-x-2 truncate">
                        <span className="text-xs font-semibold text-neutral-300 truncate">Lease_Agreement.pdf</span>
                      </div>
                      <Button
                        onClick={handleViewDocument}
                        variant="outline"
                        className="border-neutral-800 text-xs h-7 px-2.5 text-white hover:bg-neutral-900"
                      >
                        View File
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-500 mt-6 italic text-center">No documents uploaded yet.</p>
                  )}
                </div>

                <div className="pt-4 border-t border-neutral-800/40">
                  <label className="block">
                    <span className="sr-only">Upload lease agreement</span>
                    <input
                      type="file"
                      accept=".pdf, image/*"
                      onChange={handleFileUpload}
                      disabled={uploading}
                      className="block w-full text-xs text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-white file:text-neutral-950 hover:file:bg-neutral-200 file:cursor-pointer disabled:opacity-50"
                    />
                  </label>
                  {uploading && <p className="text-xs text-neutral-400 mt-2">Uploading file to storage...</p>}
                </div>
              </div>
            </div>

            {/* Tenant invitation card for landlords to copy/share */}
            {activeLease.inviteCodes?.[0] && (
              <div className="rounded-xl border border-yellow-900/30 bg-yellow-950/5 p-6 backdrop-blur-sm space-y-4">
                <div className="flex items-start space-x-3">
                  <span className="text-xl">✉️</span>
                  <div>
                    <h3 className="text-lg font-bold text-yellow-550">Tenant Invitation Pending</h3>
                    <p className="text-neutral-400 text-sm mt-1">
                      This lease has been created, but the tenant hasn&apos;t joined PropLink yet. Share the code or the direct signup link below so they can claim their lease.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="rounded-lg bg-neutral-900 border border-neutral-800/60 p-4 flex items-center justify-between">
                    <div>
                      <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Invite Code</span>
                      <span className="font-mono text-lg font-bold text-white block mt-1 tracking-wider">{activeLease.inviteCodes[0].code}</span>
                    </div>
                    <Button
                      onClick={() => handleCopyCode(activeLease.inviteCodes[0].code)}
                      variant="outline"
                      className="border-neutral-800 text-xs h-9 px-3 hover:bg-neutral-800 hover:text-white transition-colors"
                    >
                      {copiedCode ? "Copied! ✓" : "Copy Code"}
                    </Button>
                  </div>

                  <div className="rounded-lg bg-neutral-900 border border-neutral-800/60 p-4 flex items-center justify-between">
                    <div>
                      <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Direct Signup Link</span>
                      <span className="text-neutral-400 text-xs truncate max-w-[200px] sm:max-w-xs block mt-1">
                        {`${typeof window !== "undefined" ? window.location.origin : ""}/signup?code=${activeLease.inviteCodes[0].code}`}
                      </span>
                    </div>
                    <Button
                      onClick={() => handleCopyLink(activeLease.inviteCodes[0].code)}
                      variant="outline"
                      className="border-neutral-800 text-xs h-9 px-3 hover:bg-neutral-800 hover:text-white transition-colors"
                    >
                      {copiedLink ? "Link Copied! ✓" : "Copy Link"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Ledger Section */}
            <div className="pt-6 border-t border-neutral-800 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="font-bold text-white text-xl">Payment Ledger</h3>
                  <p className="text-neutral-400 text-sm mt-0.5">Track rent payments, pending approvals, and disputes.</p>
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
                  Log Payment
                </Button>
              </div>

              {/* Billing Summary Banner */}
              {billingSummary && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl border border-neutral-800 bg-neutral-900/10 p-5">
                  <div className="space-y-1">
                    <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Current Period</span>
                    <span className="text-sm font-semibold text-neutral-300 block">
                      {new Date(billingSummary.periodStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {new Date(billingSummary.periodEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Rent Due / Paid</span>
                    <span className="text-lg font-bold text-white block">
                      {billingSummary.rentAmount === 0 ? "TBD" : formatCurrency(billingSummary.rentAmount)}{" "}
                      <span className="text-neutral-500 font-normal text-sm">/ {formatCurrency(billingSummary.amountPaid)} paid</span>
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Outstanding Balance</span>
                    <span className={`text-lg font-bold block ${billingSummary.amountOutstanding > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {formatCurrency(billingSummary.amountOutstanding)}
                    </span>
                  </div>
                </div>
              )}

              {/* Payments Ledger List */}
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
                          No payments recorded yet.
                        </td>
                      </tr>
                    ) : (
                      payments.map((p) => {
                        const hasTenantDispute = p.disputedByTenant && !p.disputedByResolvedAt;
                        return (
                          <tr
                            key={p.id}
                            className="hover:bg-neutral-900/20 transition-colors cursor-pointer"
                            onClick={() => {
                              setSelectedLandlordPayment(p);
                              setIsLandlordPaymentDetailOpen(true);
                            }}
                          >
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
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                                    p.status === "confirmed"
                                      ? "bg-green-950/30 text-green-400 border-green-900/30"
                                      : p.status === "disputed"
                                      ? "bg-red-950/30 text-red-400 border-red-900/30"
                                      : "bg-yellow-950/30 text-yellow-400 border-yellow-900/30"
                                  }`}>
                                    {paymentStatusLabel[p.status] ?? p.status}
                                  </span>
                                </div>
                                {p.counterVerifiedAt && (
                                  <span className="text-[11px] text-green-500 font-medium">
                                    ✓ Acknowledged by tenant
                                  </span>
                                )}
                                {hasTenantDispute && (
                                  <span className="text-[11px] text-red-400 font-medium bg-red-950/20 border border-red-900/30 rounded p-1.5 mt-1 block">
                                    ⚠️ Tenant Flagged: {p.disputedByReason}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={(e) => { e.stopPropagation(); setSelectedLandlordPayment(p); setIsLandlordPaymentDetailOpen(true); }}
                                className="text-xs text-neutral-400 hover:text-white underline mr-2"
                              >
                                Details
                              </button>
                              {p.status === "pending" && (
                                <div className="flex items-center justify-end space-x-2">
                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      confirmPayment.mutate({ paymentId: p.id });
                                    }}
                                    disabled={confirmPayment.isPending}
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-500 text-white h-8 text-xs font-semibold px-3"
                                  >
                                    Confirm
                                  </Button>
                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRejectPaymentId(p.id);
                                      setRejectReason("");
                                      setIsRejectOpen(true);
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className="border-neutral-800 text-red-400 hover:bg-red-950/20 hover:border-red-900/30 h-8 text-xs font-semibold px-3"
                                  >
                                    Reject
                                  </Button>
                                </div>
                              )}
                              {hasTenantDispute && (
                                <div className="flex items-center justify-end space-x-2">
                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditPaymentId(p.id);
                                      setEditAmount(String(p.amount));
                                      setEditPaymentDate(new Date(p.paymentDate).toISOString().split("T")[0]);
                                      setEditMethod(p.method);
                                      setEditAction("edit");
                                      setIsEditOpen(true);
                                    }}
                                    size="sm"
                                    className="bg-white text-neutral-950 hover:bg-neutral-200 h-8 text-xs font-semibold px-3"
                                  >
                                    Correct Details
                                  </Button>
                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm("Are you sure you want to void this payment record? This will exclude it from outstanding balance calculations.")) {
                                        resolvePayment.mutate({
                                          paymentId: p.id,
                                          action: "void"
                                        });
                                      }
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className="border-neutral-800 text-red-400 hover:bg-red-950/20 hover:border-red-900/30 h-8 text-xs font-semibold px-3"
                                  >
                                    Void
                                  </Button>
                                </div>
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
        ) : (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-12 text-center max-w-xl mx-auto space-y-4">
            <h3 className="text-lg font-medium text-white">This unit is vacant</h3>
            <p className="text-neutral-400 text-sm">
              Create a formal tenancy lease to link a tenant to this unit and enable tracking.
            </p>
            <Button
              onClick={() => setIsAddLeaseOpen(true)}
              className="bg-white text-neutral-950 hover:bg-neutral-200 mt-2"
            >
              Add New Lease
            </Button>
          </div>
        )}

      </main>

      {/* Edit Unit Modal */}
      {isEditUnitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-8 shadow-2xl flex flex-col space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold tracking-tight">Edit Unit</h2>
              <button
                onClick={() => {
                  setIsEditUnitOpen(false);
                  setEditUnitError(null);
                }}
                className="text-neutral-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleUpdateUnitSubmit} className="space-y-4">
              {editUnitError && (
                <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-3 text-sm text-red-400">
                  {editUnitError}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label htmlFor="editUnitNumber" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Unit Number / Name
                  </label>
                  <input
                    id="editUnitNumber"
                    type="text"
                    required
                    value={editUnitNumber}
                    onChange={(e) => setEditUnitNumber(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                    placeholder="e.g. Flat 101, Shop 5"
                  />
                </div>

                <div>
                  <label htmlFor="editUnitType" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Unit Type
                  </label>
                  <select
                    id="editUnitType"
                    value={editUnitType}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditUnitType(val);
                      if (!isResidentialUnitType(val)) {
                        setEditRoomsCount("");
                      }
                    }}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-[38px]"
                  >
                    {allowedUnitTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                {isResidentialUnitType(editUnitType) && (
                  <div>
                    <label htmlFor="editRoomsCount" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Number of Rooms
                    </label>
                    <input
                      id="editRoomsCount"
                      type="number"
                      min="0"
                      value={editRoomsCount}
                      onChange={(e) => setEditRoomsCount(e.target.value)}
                      placeholder="e.g. 3"
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                    />
                  </div>
                )}
              </div>

              <div className="flex space-x-3 mt-6 pt-4 border-t border-neutral-800">
                <Button
                  type="button"
                  onClick={() => {
                    setIsEditUnitOpen(false);
                    setEditUnitError(null);
                  }}
                  variant="outline"
                  className="w-1/2 border-neutral-800 text-white hover:bg-neutral-900 h-10 text-sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateUnit.isPending}
                  className="w-1/2 bg-white text-neutral-950 hover:bg-neutral-200 h-10 text-sm"
                >
                  {updateUnit.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Renew Lease Modal */}
      {isRenewLeaseOpen && activeLease && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-8 shadow-2xl flex flex-col space-y-6 my-8">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Renew Lease</h2>
                <p className="text-neutral-400 text-sm mt-1">
                  Creates a new lease for the same tenant. The current lease is preserved as history.
                </p>
              </div>
              <button
                onClick={() => {
                  setIsRenewLeaseOpen(false);
                  resetRenewForm();
                }}
                className="text-neutral-400 hover:text-white ml-4 flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Read-only tenant/unit info */}
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 text-sm">
              <div>
                <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Tenant</span>
                <span className="text-white font-semibold mt-1 block">{activeLease.tenant.fullName}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Unit</span>
                <span className="text-white font-semibold mt-1 block">Unit {unit?.unitNumber}</span>
              </div>
            </div>

            <form onSubmit={handleRenewLeaseSubmit} className="space-y-4">
              {renewError && (
                <div className="rounded bg-red-950/20 border border-red-900/30 p-2.5 text-xs text-red-400">
                  {renewError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="renewStartDate" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    New Start Date
                  </label>
                  <input
                    id="renewStartDate"
                    type="date"
                    required
                    value={renewStartDate}
                    onChange={(e) => handleRenewStartDateChange(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                  />
                </div>
                <div>
                  <label htmlFor="renewEndDate" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    New End Date {unit && !isResidentialUnitType(unit.unitType) && <span className="text-neutral-500 normal-case font-normal">(required)</span>}
                  </label>
                  <input
                    id="renewEndDate"
                    type="date"
                    required
                    value={renewEndDate}
                    onChange={(e) => setRenewEndDate(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                  />
                  {unit && isResidentialUnitType(unit.unitType) && (
                    <p className="text-xs text-neutral-500 mt-1">Auto-set to 1 year from start date</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="renewRentAmount" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Rent Amount (₦)
                  </label>
                  <input
                    id="renewRentAmount"
                    type="number"
                    min="0"
                    value={renewRentAmount}
                    onChange={(e) => setRenewRentAmount(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                    placeholder="e.g. 1500000"
                  />
                </div>
                <div>
                  <label htmlFor="renewRentFrequency" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Frequency
                  </label>
                  <select
                    id="renewRentFrequency"
                    value={renewRentFrequency}
                    onChange={(e) => setRenewRentFrequency(e.target.value as RentFrequency)}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                  >
                    {Object.values(RentFrequency).map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="renewDepositAmount" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Security Deposit (₦) <span className="text-neutral-500 normal-case font-normal">— optional</span>
                </label>
                <input
                  id="renewDepositAmount"
                  type="number"
                  min="0"
                  value={renewDepositAmount}
                  onChange={(e) => setRenewDepositAmount(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                  placeholder="e.g. 300000"
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <Button
                  type="button"
                  onClick={() => {
                    setIsRenewLeaseOpen(false);
                    resetRenewForm();
                  }}
                  variant="outline"
                  className="w-1/2 border-neutral-800 text-white hover:bg-neutral-900 h-10 text-sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={renewLease.isPending}
                  className="w-1/2 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold h-10 text-sm"
                >
                  {renewLease.isPending ? "Creating..." : "Create Renewal Lease"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Lease Modal */}
      {isAddLeaseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-8 shadow-2xl flex flex-col space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold tracking-tight">Invite Tenant</h2>
              <button
                onClick={() => {
                  setIsAddLeaseOpen(false);
                  resetLeaseForm();
                }}
                className="text-neutral-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateLease} className="space-y-4">
              {leaseError && (
                <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-3 text-sm text-red-400">
                  {leaseError}
                </div>
              )}

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="tenantName" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Tenant Full Name
                    </label>
                    <input
                      id="tenantName"
                      type="text"
                      required
                      value={tenantName}
                      onChange={(e) => setTenantName(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                      placeholder="e.g. Sandra Okon"
                    />
                  </div>
                  <div>
                    <label htmlFor="tenantEmail" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Tenant Email
                    </label>
                    <input
                      id="tenantEmail"
                      type="email"
                      required
                      value={tenantEmail}
                      onChange={(e) => setTenantEmail(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                      placeholder="sandra@example.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="startDate" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Start Date
                    </label>
                    <input
                      id="startDate"
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => handleStartDateChange(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-[38px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="endDate" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      End Date
                    </label>
                    <input
                      id="endDate"
                      type="date"
                      required
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-[38px]"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="rentAmount" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Rent Amount (₦) - Optional
                  </label>
                  <input
                    id="rentAmount"
                    type="number"
                    value={rentAmount}
                    onChange={(e) => setRentAmount(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                    placeholder="e.g. 150000 (can be left blank / TBD)"
                  />
                </div>
              </div>

              <div className="flex space-x-3 mt-6 pt-4 border-t border-neutral-800">
                <Button
                  type="button"
                  onClick={() => {
                    setIsAddLeaseOpen(false);
                    resetLeaseForm();
                  }}
                  variant="outline"
                  className="w-1/2 border-neutral-800 text-white hover:bg-neutral-900 h-10 text-sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createLease.isPending}
                  className="w-1/2 bg-white text-neutral-950 hover:bg-neutral-200 h-10 text-sm"
                >
                  {createLease.isPending ? "Sending..." : "Send Invite"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Lease Modal */}
      {isEditLeaseOpen && activeLease && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-8 shadow-2xl flex flex-col space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold tracking-tight">Edit Lease Details</h2>
              <button
                onClick={() => setIsEditLeaseOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleUpdateLeaseSubmit} className="space-y-4">
              {editLeaseError && (
                <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-3 text-sm text-red-400">
                  {editLeaseError}
                </div>
              )}

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="editStartDate" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Start Date
                    </label>
                    <input
                      id="editStartDate"
                      type="date"
                      required
                      value={editStartDate}
                      onChange={(e) => handleEditStartDateChange(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-[38px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="editEndDate" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      End Date
                    </label>
                    <input
                      id="editEndDate"
                      type="date"
                      required
                      value={editEndDate}
                      onChange={(e) => setEditEndDate(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-[38px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="editRentAmount" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Rent Amount (₦)
                    </label>
                    <input
                      id="editRentAmount"
                      type="number"
                      value={editRentAmount}
                      onChange={(e) => setEditRentAmount(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                      placeholder="e.g. 150000"
                    />
                  </div>
                  <div>
                    <label htmlFor="editRentFrequency" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Frequency
                    </label>
                    <select
                      id="editRentFrequency"
                      value={editRentFrequency}
                      onChange={(e) => setEditRentFrequency(e.target.value as RentFrequency)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-[38px]"
                    >
                      <option value={RentFrequency.monthly}>Monthly</option>
                      <option value={RentFrequency.quarterly}>Quarterly</option>
                      <option value={RentFrequency.annually}>Annually</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="editDepositAmount" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Deposit Amount (₦) - Optional
                  </label>
                  <input
                    id="editDepositAmount"
                    type="number"
                    value={editDepositAmount}
                    onChange={(e) => setEditDepositAmount(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                    placeholder="e.g. 50000"
                  />
                </div>
              </div>

              <div className="flex space-x-3 mt-6 pt-4 border-t border-neutral-800">
                <Button
                  type="button"
                  onClick={() => setIsEditLeaseOpen(false)}
                  variant="outline"
                  className="w-1/2 border-neutral-800 text-white hover:bg-neutral-900 h-10 text-sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateLease.isPending}
                  className="w-1/2 bg-white text-neutral-950 hover:bg-neutral-200 h-10 text-sm"
                >
                  {updateLease.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Payment Modal */}
      {isLogPaymentOpen && activeLease && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl my-8">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-neutral-800">
              <h2 className="text-xl font-bold text-white font-sans">Log Manual Payment</h2>
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
                  placeholder="Reference, receipt numbers or bank metadata..."
                />
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
                  disabled={createPayment.isPending}
                  className="w-1/2 bg-white text-neutral-950 hover:bg-neutral-200 h-10 text-sm font-semibold"
                >
                  {createPayment.isPending ? "Logging..." : "Log Payment"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Payment Modal */}
      {isRejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-neutral-800">
              <h2 className="text-lg font-bold text-white font-sans">Dispute Tenant Payment</h2>
              <button
                onClick={() => {
                  setIsRejectOpen(false);
                  setRejectReason("");
                  setRejectPaymentId("");
                }}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!rejectReason.trim()) {
                  alert("Reason is required.");
                  return;
                }
                await rejectPayment.mutateAsync({
                  paymentId: rejectPaymentId,
                  reason: rejectReason,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label htmlFor="rejectReason" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Reason for dispute
                </label>
                <textarea
                  id="rejectReason"
                  required
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-24"
                  placeholder="Specify why this payment is incorrect (e.g. money never received, wrong amount)..."
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <Button
                  type="button"
                  onClick={() => {
                    setIsRejectOpen(false);
                    setRejectReason("");
                    setRejectPaymentId("");
                  }}
                  variant="outline"
                  className="w-1/2 border-neutral-800 text-white hover:bg-neutral-900 h-[38px]"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!rejectReason.trim() || rejectPayment.isPending}
                  className="w-1/2 bg-red-600 hover:bg-red-500 text-white font-semibold h-[38px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {rejectPayment.isPending ? "Submitting..." : "Submit"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Landlord Payment Detail Modal */}
      {isLandlordPaymentDetailOpen && selectedLandlordPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-neutral-800">
              <h2 className="text-xl font-bold text-white font-sans">Payment Details</h2>
              <button
                onClick={() => { setIsLandlordPaymentDetailOpen(false); setSelectedLandlordPayment(null); }}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Amount</span>
                  <span className="text-base font-bold text-white mt-1 block">{formatCurrency(selectedLandlordPayment.amount)}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Status</span>
                  <span className="mt-1 block">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                      selectedLandlordPayment.status === "confirmed"
                        ? "bg-green-950/30 text-green-400 border-green-900/30"
                        : selectedLandlordPayment.status === "disputed"
                        ? "bg-red-950/30 text-red-400 border-red-900/30"
                        : "bg-yellow-950/30 text-yellow-400 border-yellow-900/30"
                    }`}>
                      {paymentStatusLabel[selectedLandlordPayment.status] ?? selectedLandlordPayment.status}
                    </span>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Payment Date</span>
                  <span className="text-neutral-300 mt-1 block">{new Date(selectedLandlordPayment.paymentDate).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Method</span>
                  <span className="text-neutral-300 mt-1 block capitalize">{selectedLandlordPayment.method.replace('_', ' ')}</span>
                </div>
              </div>

              <div>
                <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Period Covered</span>
                <span className="text-neutral-300 mt-1 block">
                  {new Date(selectedLandlordPayment.periodStart).toLocaleDateString()} – {new Date(selectedLandlordPayment.periodEnd).toLocaleDateString()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Logged By</span>
                  <span className="text-neutral-300 mt-1 block capitalize">
                    {selectedLandlordPayment.recorder?.fullName || "System"} ({selectedLandlordPayment.recordedByRole})
                  </span>
                </div>
                {selectedLandlordPayment.confirmedAt && (
                  <div>
                    <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Confirmed At</span>
                    <span className="text-neutral-300 mt-1 block">{new Date(selectedLandlordPayment.confirmedAt).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              {selectedLandlordPayment.notes && (
                <div>
                  <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Notes</span>
                  <p className="text-neutral-300 mt-1 bg-neutral-900/50 p-2.5 rounded-lg border border-neutral-800 text-xs">{selectedLandlordPayment.notes}</p>
                </div>
              )}

              {selectedLandlordPayment.disputeReason && (
                <div>
                  <span className="block text-xs font-semibold text-red-400 uppercase tracking-wider">Rejection Reason</span>
                  <p className="text-red-400 mt-1 bg-red-950/10 p-2.5 rounded-lg border border-red-900/20 text-xs">{selectedLandlordPayment.disputeReason}</p>
                </div>
              )}

              {selectedLandlordPayment.disputedByReason && (
                <div>
                  <span className="block text-xs font-semibold text-orange-400 uppercase tracking-wider">Tenant Dispute Reason</span>
                  <p className="text-orange-400 mt-1 bg-orange-950/10 p-2.5 rounded-lg border border-orange-900/20 text-xs">{selectedLandlordPayment.disputedByReason}</p>
                </div>
              )}

              {selectedLandlordPayment.proofUrl && (
                <div>
                  <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Proof Document</span>
                  <button
                    onClick={() => handleViewPaymentProof(selectedLandlordPayment.proofUrl!)}
                    className="mt-2 inline-flex items-center text-xs text-white hover:underline bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-neutral-800"
                  >
                    View / Download Proof
                  </button>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-neutral-800">
              <Button
                onClick={() => { setIsLandlordPaymentDetailOpen(false); setSelectedLandlordPayment(null); }}
                className="w-full bg-white text-neutral-950 hover:bg-neutral-200 font-semibold h-[38px]"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Resolve Dispute Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-neutral-800">
              <h2 className="text-lg font-bold text-white font-sans">Resolve Payment Dispute</h2>
              <button
                onClick={() => {
                  setIsEditOpen(false);
                  resetEditForm();
                }}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditPaymentSubmit} className="space-y-4">
              <div>
                <label htmlFor="editAction" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Resolution Action
                </label>
                <select
                  id="editAction"
                  value={editAction}
                  onChange={(e) => setEditAction(e.target.value as "edit" | "void")}
                  className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                >
                  <option value="edit">Correct Details & Keep Confirmed</option>
                  <option value="void">Void Payment Entirely</option>
                </select>
              </div>

              {editAction === "edit" ? (
                <>
                  <div>
                    <label htmlFor="editAmount" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Corrected Amount (₦)
                    </label>
                    <input
                      id="editAmount"
                      type="number"
                      required
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                    />
                  </div>
                  <div>
                    <label htmlFor="editPaymentDate" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Corrected Date
                    </label>
                    <input
                      id="editPaymentDate"
                      type="date"
                      required
                      value={editPaymentDate}
                      onChange={(e) => setEditPaymentDate(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                    />
                  </div>
                  <div>
                    <label htmlFor="editMethod" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Corrected Method
                    </label>
                    <select
                      id="editMethod"
                      value={editMethod}
                      onChange={(e) => setEditMethod(e.target.value as PaymentMethod)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                    >
                      <option value={PaymentMethod.cash}>Cash</option>
                      <option value={PaymentMethod.bank_transfer}>Bank Transfer</option>
                      <option value={PaymentMethod.cheque}>Cheque</option>
                      <option value={PaymentMethod.other}>Other</option>
                    </select>
                  </div>
                </>
              ) : (
                <p className="text-xs text-neutral-400 bg-red-950/20 border border-red-900/30 p-2.5 rounded">
                  ⚠️ Voiding this payment marks it as disputed and removes it from outstanding balance calculations.
                </p>
              )}

              <div className="flex space-x-3 pt-2">
                <Button
                  type="button"
                  onClick={() => {
                    setIsEditOpen(false);
                    resetEditForm();
                  }}
                  variant="outline"
                  className="w-1/2 border-neutral-800 text-white hover:bg-neutral-900 h-[38px]"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={resolvePayment.isPending}
                  className="w-1/2 bg-white text-neutral-950 hover:bg-neutral-200 font-semibold h-[38px]"
                >
                  {resolvePayment.isPending ? "Saving..." : "Apply Resolution"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
