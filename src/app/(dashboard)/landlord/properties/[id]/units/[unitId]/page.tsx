'use client';

import { useState, useMemo, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { DetailActionRow } from "@/components/layout/DetailActionRow";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Select } from "@/components/ui/select";
import { RentFrequency, PaymentMethod } from "@prisma/client";
import { X, Trash2, Plus, Pencil, Check } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { useChatWidget } from "@/components/ChatWidgetContext";
import { isResidentialUnitType, getUnitTypesByPropertyType } from "@/lib/unit-types";
import { formatCurrency, formatInputNumber, cn } from "@/lib/utils";
import { getDueDateStatus, formatDateGB } from "@/lib/billing";
import { getCurrentLease, getNextLease } from "@/lib/leases";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LeaseDocumentsCard } from "@/components/documents/LeaseDocumentsCard";

export default function UnitDetailPage() {
  const router = useRouter();
  const params = useParams();
  const propertyId = params.id as string;
  const unitId = params.unitId as string;
  const utils = trpc.useUtils();
  const chatWidget = useChatWidget();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // Auto-open chat widget if tab === "chat"
  useEffect(() => {
    if (searchParams?.get("tab") === "chat") {
      chatWidget.open(unitId);
    }
  }, [searchParams, unitId, chatWidget]);

  // Queries
  const { data: properties } = trpc.properties.list.useQuery();
  const { data: unitStatus, isLoading: isLoadingStatus } = trpc.units.getStatus.useQuery({ id: unitId });
  const { data: leaseData, isLoading: isLoadingLeases } = trpc.leases.getForUnit.useQuery({ unitId });

  // Find unit details from properties list
  const property = properties?.find((p) => p.id === propertyId);
  const unit = property?.units.find((u) => u.id === unitId);

  // Leases: current and next lease
  const leases = leaseData?.leases;
  const currentLease = leaseData?.currentLease ?? getCurrentLease(leases);
  const nextLease = leaseData?.nextLease ?? getNextLease(leases);
  const activeLease = currentLease;

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

  const [isEditLeaseOpen, setIsEditLeaseOpen] = useState(false);
  const [editRentAmount, setEditRentAmount] = useState("");
  const [editRentFrequency, setEditRentFrequency] = useState<RentFrequency>(RentFrequency.annually);
  const [editDepositAmount, setEditDepositAmount] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editLeaseError, setEditLeaseError] = useState<string | null>(null);
  const [editingLeaseId, setEditingLeaseId] = useState<string | null>(null);
  const [deleteLeaseConfirmId, setDeleteLeaseConfirmId] = useState<string | null>(null);

  const deleteLease = trpc.leases.delete.useMutation({
    onSuccess: () => {
      utils.leases.getForUnit.invalidate({ unitId });
      utils.units.getStatus.invalidate({ id: unitId });
      utils.properties.list.invalidate();
      toast("Lease deleted", "success");
      setDeleteLeaseConfirmId(null);
    },
    onError: (err) => {
      toast(err.message, "error");
    },
  });

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
      setEditingLeaseId(null);
    },
    onError: (err) => {
      setEditLeaseError(err.message);
    },
  });

  const handleOpenEditLease = (leaseToEdit = currentLease) => {
    if (leaseToEdit) {
      setEditingLeaseId(leaseToEdit.id);
      setEditRentAmount(Number(leaseToEdit.rentAmount) === 0 ? "" : formatInputNumber(leaseToEdit.rentAmount.toString()));
      setEditRentFrequency(leaseToEdit.rentFrequency);
      setEditDepositAmount(leaseToEdit.depositAmount ? formatInputNumber(leaseToEdit.depositAmount.toString()) : "");
      setEditStartDate(new Date(leaseToEdit.startDate).toISOString().split("T")[0]);
      setEditEndDate(new Date(leaseToEdit.endDate).toISOString().split("T")[0]);
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

    const rent = editRentAmount ? parseFloat(editRentAmount.replace(/,/g, "")) : 0;
    const deposit = editDepositAmount ? parseFloat(editDepositAmount.replace(/,/g, "")) : null;

    if (editRentAmount && (isNaN(rent) || rent < 0)) {
      setEditLeaseError("Rent amount must be a positive number.");
      return;
    }

    try {
      await updateLease.mutateAsync({
        id: editingLeaseId || activeLease!.id,
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
      toast("Unit deleted", "success");
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
    setIsDeleteUnitConfirmOpen(true);
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
      setIsLandlordPaymentDetailOpen(false);
      setSelectedLandlordPayment(null);
      toast('Payment confirmed', 'success');
    },
    onError: (err) => {
      toast(err.message, 'error');
    },
  });

  const rejectPayment = trpc.payments.reject.useMutation({
    onSuccess: () => {
      utils.payments.list.invalidate({ leaseId: activeLease?.id });
      utils.payments.getBillingSummary.invalidate({ leaseId: activeLease?.id });
      setIsRejectOpen(false);
      setRejectReason('');
      setRejectPaymentId('');
      setIsLandlordPaymentDetailOpen(false);
      setSelectedLandlordPayment(null);
      toast('Payment rejected', 'info');
    },
    onError: (err) => {
      toast(err.message, 'error');
    },
  });

  const resolvePayment = trpc.payments.resolve.useMutation({
    onSuccess: () => {
      utils.payments.list.invalidate({ leaseId: activeLease?.id });
      utils.payments.getBillingSummary.invalidate({ leaseId: activeLease?.id });
      setIsEditOpen(false);
      resetEditForm();
      toast('Dispute resolved', 'success');
    },
    onError: (err) => {
      toast(err.message, 'error');
    },
  });

  const deletePaymentProofMutation = trpc.payments.deleteProof.useMutation({
    onSuccess: () => {
      toast("Payment proof removed", "success");
      utils.payments.list.invalidate({ leaseId: activeLease?.id });
      if (selectedLandlordPayment) {
        setSelectedLandlordPayment({
          ...selectedLandlordPayment,
          proofUrl: null,
        });
      }
      setIsDeletePaymentProofConfirmOpen(false);
    },
    onError: (err) => {
      toast(err.message, "error");
    },
  });

  const attachPaymentProofMutation = trpc.payments.attachProof.useMutation({
    onSuccess: (_, vars) => {
      toast("Proof uploaded successfully", "success");
      utils.payments.list.invalidate({ leaseId: activeLease?.id });
      if (selectedLandlordPayment) {
        setSelectedLandlordPayment({
          ...selectedLandlordPayment,
          proofUrl: vars.proofUrl,
        });
      }
    },
    onError: (err) => {
      toast(err.message, "error");
    },
  });

  // States
  const [isAddLeaseOpen, setIsAddLeaseOpen] = useState(false);
  const [isDeleteUnitConfirmOpen, setIsDeleteUnitConfirmOpen] = useState(false);
  const [paymentToVoid, setPaymentToVoid] = useState<string | null>(null);

  // Payment Ledger States
  const [isLogPaymentOpen, setIsLogPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.cash);
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [selectedPaymentLeaseId, setSelectedPaymentLeaseId] = useState<string>("");

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
  const [tenantNameError, setTenantNameError] = useState<string | null>(null);
  const [tenantEmailError, setTenantEmailError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rentAmount, setRentAmount] = useState("");
  const [rentFrequency, setRentFrequency] = useState<RentFrequency>(RentFrequency.monthly);
  const [depositAmount, setDepositAmount] = useState("");
  const [leaseError, setLeaseError] = useState<string | null>(null);

  // Payment Proof File Upload State
  const [isDeletePaymentProofConfirmOpen, setIsDeletePaymentProofConfirmOpen] = useState(false);
  const [uploadingPaymentProof, setUploadingPaymentProof] = useState(false);

  // Copy Invitation States
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Landlord payment detail modal
  const [selectedLandlordPayment, setSelectedLandlordPayment] = useState<NonNullable<typeof payments>[number] | null>(null);
  const [isLandlordPaymentDetailOpen, setIsLandlordPaymentDetailOpen] = useState(false);

  // Auto-open payment detail if paymentId param is present
  useEffect(() => {
    const paymentId = searchParams?.get("paymentId");
    if (paymentId && payments && payments.length > 0) {
      const p = payments.find((item) => item.id === paymentId);
      if (p) {
        setSelectedLandlordPayment(p);
        setIsLandlordPaymentDetailOpen(true);
      }
    }
  }, [searchParams, payments]);

  // Year filter for payment ledger
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Derived: unique years present in payment history (always includes current year)
  // NOTE: must live here, before any early returns, to satisfy React Rules of Hooks.
  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    if (!payments || payments.length === 0) return [currentYear];
    const years = new Set(payments.map((p) => new Date(p.paymentDate).getFullYear()));
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [payments]);

  // Payments visible in the current year selection
  const filteredPayments = useMemo(() => {
    if (!payments) return [];
    return payments.filter((p) => new Date(p.paymentDate).getFullYear() === selectedYear);
  }, [payments, selectedYear]);

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
    setTenantNameError(null);
    setTenantEmailError(null);
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
    setRenewRentAmount(Number(activeLease.rentAmount) === 0 ? "" : formatInputNumber(activeLease.rentAmount.toString()));
    setRenewRentFrequency(activeLease.rentFrequency);
    setRenewDepositAmount(activeLease.depositAmount ? formatInputNumber(activeLease.depositAmount.toString()) : "");
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

    const rent = renewRentAmount ? parseFloat(renewRentAmount.replace(/,/g, "")) : 0;
    const deposit = renewDepositAmount ? parseFloat(renewDepositAmount.replace(/,/g, "")) : null;

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
    setPaymentMethod(PaymentMethod.cash);
    setPaymentNotes("");
    setPaymentError(null);
    setSelectedPaymentLeaseId(currentLease?.id || "");
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
    setTenantNameError(null);
    setTenantEmailError(null);

    let hasError = false;
    if (!tenantName.trim()) {
      setTenantNameError("Tenant full name is required.");
      hasError = true;
    }
    if (!tenantEmail.trim()) {
      setTenantEmailError("Tenant email is required.");
      hasError = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tenantEmail.trim())) {
      setTenantEmailError("Please enter a valid email address.");
      hasError = true;
    }

    const rent = rentAmount ? parseFloat(rentAmount.replace(/,/g, "")) : undefined;
    const deposit = depositAmount ? parseFloat(depositAmount.replace(/,/g, "")) : undefined;

    if (rentAmount && (isNaN(rent!) || rent! < 0)) {
      setLeaseError("Rent amount must be a positive number.");
      hasError = true;
    }
    if (depositAmount && (isNaN(deposit!) || deposit! <= 0)) {
      setLeaseError("Deposit amount must be a positive number.");
      hasError = true;
    }

    if (hasError) return;

    try {
      await createLease.mutateAsync({
        unitId,
        tenantName: tenantName.trim(),
        tenantEmail: tenantEmail.trim(),
        startDate: startDate || undefined,
        endDate: endDate || undefined,
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

    const amount = parseFloat(paymentAmount.replace(/,/g, ""));
    if (isNaN(amount) || amount <= 0) {
      setPaymentError("Amount must be a positive number.");
      return;
    }

    const targetLeaseId = selectedPaymentLeaseId || activeLease!.id;
    const isPayingNextLease = Boolean(nextLease && targetLeaseId === nextLease.id);

    if (!isPayingNextLease && billingSummary && billingSummary.isRentSet && amount > billingSummary.remainingLeaseRent) {
      setPaymentError(`This is more than the ${formatCurrency(billingSummary.remainingLeaseRent)} left on this lease.`);
      return;
    }

    try {
      await createPayment.mutateAsync({
        leaseId: targetLeaseId,
        amount,
        paymentDate: new Date(paymentDate).toISOString(),
        method: paymentMethod,
        notes: paymentNotes || undefined,
        confirmUpcoming: isPayingNextLease,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to log payment.";
      setPaymentError(message);
    }
  };

  const handleEditPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(editAmount.replace(/,/g, ""));
    if (editAction === "edit" && (isNaN(amount) || amount <= 0)) {
      toast("Amount must be a positive number", "error");
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
    } catch {
      toast("Could not update payment", "error");
    }
  };

  const handleViewPaymentProof = async (path: string) => {
    try {
      const { signedUrl } = await utils.client.payments.getDownloadUrl.query({ path });
      window.open(signedUrl, "_blank");
    } catch {
      toast("Could not open payment proof", "error");
    }
  };

  const handleLandlordProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedLandlordPayment || !activeLease) return;

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
      setUploadingPaymentProof(true);
      const { signedUrl, path } = await utils.client.payments.getUploadUrl.mutate({
        leaseId: activeLease.id,
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

      await attachPaymentProofMutation.mutateAsync({
        paymentId: selectedLandlordPayment.id,
        proofUrl: path,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to upload proof.";
      toast(message, "error");
    } finally {
      setUploadingPaymentProof(false);
      e.target.value = "";
    }
  };

  if (isLoadingStatus || isLoadingLeases) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white">
        <PageHeader title={unit ? `Unit ${unit.unitNumber}` : "Unit"} />

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12 space-y-6">
          <div className="flex items-center justify-between">
            <BackButton href={`/landlord/properties/${propertyId}`} label="Back to Property" />
            <div className="hidden sm:flex space-x-2">
              <Skeleton className="h-9 w-20 rounded-md" />
              <Skeleton className="h-9 w-20 rounded-md" />
            </div>
          </div>

          {/* Unit Header Card */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 backdrop-blur-sm space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center space-x-3">
                  <Skeleton className="h-8 w-36" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <Skeleton className="h-4 w-52" />
              </div>
              <div className="flex items-center space-x-3">
                <Skeleton className="h-9 w-24 rounded-md" />
                <Skeleton className="h-9 w-24 rounded-md" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-neutral-800">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-20 mt-1" />
                </div>
              ))}
            </div>
          </div>

          {/* Lease / Timeline Card */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 backdrop-blur-sm space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-32 mt-1" />
                </div>
              ))}
            </div>
            <Skeleton className="h-3 w-full rounded-full mt-4" />
          </div>

          {/* Payments Ledger Section */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-8 w-28 rounded-md" />
            </div>
            <div className="p-4 border-b border-neutral-800 flex gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20 ml-auto" />
            </div>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-4 border-b border-neutral-800/60 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </main>
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

  if (timeline) {
    const startMs = new Date(timeline.startDate).getTime();
    const endMs = new Date(timeline.endDate).getTime();
    const todayMs = new Date().getTime();

    const totalDuration = endMs - startMs;
    const elapsed = Math.max(0, Math.min(totalDuration, todayMs - startMs));
    todayPercent = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;
  }

  // availableYears and filteredPayments are declared above, before the early returns.

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Sticky header shows only unit title and notification bell */}
      <PageHeader title={`Unit ${unit.unitNumber}`} />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12 space-y-6">
        <DetailActionRow
          backHref={`/landlord/properties/${propertyId}`}
          backLabel="Back to Property"
          actions={[
            {
              label: "Edit Unit",
              onClick: handleOpenEditUnit,
              icon: <Pencil className="w-4 h-4" />,
              variant: "outline",
            },
            {
              label: "Delete Unit",
              onClick: handleDeleteUnit,
              icon: <Trash2 className="w-4 h-4" />,
              variant: "danger",
            },
          ]}
        />

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
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold capitalize ${
                  unitStatus?.status === "occupied"
                    ? "bg-green-950/30 text-green-400 border border-green-900/30"
                    : unitStatus?.status === "reserved"
                    ? "bg-blue-950/30 text-blue-400 border border-blue-900/30"
                    : "bg-yellow-950/30 text-yellow-400 border border-yellow-900/30"
                }`}
              >
                {unitStatus?.status === "reserved" ? "Reserved" : unitStatus?.status}
              </span>
            </div>
            <p className="text-neutral-400 text-sm mt-1 capitalize">
              {unit.unitType} {unit.sizeSqm ? `• ${unit.sizeSqm} sqm` : ""}
            </p>
          </div>

          {activeLease ? (
            <div className="border-t md:border-t-0 md:border-l border-neutral-800 pt-4 md:pt-0 md:pl-6 flex flex-col space-y-1.5 min-w-[250px]">
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Current Tenant</span>
              <span className="text-sm font-semibold text-white">{activeLease.tenant.fullName}</span>
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
                      onClick={() => handleOpenEditLease()}
                      className="text-xs text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 hover:border-neutral-700 px-2 py-1 rounded transition-colors"
                    >
                      Edit Details
                    </button>
                    {timeline && (timeline.status === "renewal_due" || timeline.status === "expired") && !nextLease && (
                      <Button
                        onClick={handleOpenRenewLease}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white h-7 px-2.5 text-xs font-semibold"
                      >
                        Renew Lease
                      </Button>
                    )}
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
                      {activeLease.inviteCodes.length > 0 ? (
                        activeLease.inviteCodes[0].redeemedAt ? (
                          <span className="text-green-400">
                            Claimed by {activeLease.tenant.fullName}
                          </span>
                        ) : new Date() > new Date(activeLease.inviteCodes[0].expiresAt) ? (
                          <span className="text-red-400 font-mono">
                            Invite Code: {activeLease.inviteCodes[0].code} (Expired)
                          </span>
                        ) : (
                          <span className="text-yellow-500 font-mono">
                            Invite Code: {activeLease.inviteCodes[0].code} (Awaiting Tenant)
                          </span>
                        )
                      ) : (
                        <span className="text-neutral-400">
                          Linked to existing tenant account
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Slim Next lease row */}
                {nextLease && (() => {
                  const todayMidnight = new Date();
                  todayMidnight.setHours(0, 0, 0, 0);
                  const nextStart = new Date(nextLease.startDate);
                  nextStart.setHours(0, 0, 0, 0);
                  const diffDays = Math.max(0, Math.ceil((nextStart.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24)));

                  const nextLeaseMenuItems: ActionMenuItem[] = [
                    {
                      label: "Edit",
                      icon: <Pencil className="w-4 h-4" />,
                      onClick: () => handleOpenEditLease(nextLease),
                    },
                    {
                      label: "Delete",
                      icon: <Trash2 className="w-4 h-4" />,
                      variant: "danger",
                      onClick: () => setDeleteLeaseConfirmId(nextLease.id),
                    },
                  ];

                  return (
                    <div className="pt-4 border-t border-neutral-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2 text-neutral-300">
                        <span className="font-semibold text-neutral-400">Next lease:</span>
                        <span className="font-medium text-white">
                          {formatDateGB(nextLease.startDate)} – {formatDateGB(nextLease.endDate)}
                        </span>
                        <span className="text-neutral-500">·</span>
                        <span>
                          {Number(nextLease.rentAmount) === 0
                            ? "TBD"
                            : `${formatCurrency(nextLease.rentAmount)} / ${nextLease.rentFrequency}`}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-950/40 text-blue-400 border border-blue-900/40 leading-none">
                          Upcoming
                        </span>
                        <span className="text-neutral-400">
                          Starts in {diffDays} {diffDays === 1 ? "day" : "days"}
                        </span>
                      </div>
                      <div className="self-end sm:self-auto">
                        <ActionMenu items={nextLeaseMenuItems} />
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Documents Card */}
              <LeaseDocumentsCard leaseId={activeLease.id} mode="landlord" />
            </div>

            {/* Tenant invitation card for landlords to copy/share */}
            {(() => {
              const invite = activeLease.inviteCodes?.[0];
              if (!invite || invite.redeemedAt) return null;
              const isExpired = new Date(invite.expiresAt) <= new Date();
              if (isExpired) {
                return (
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-400">
                    Invite expired
                  </div>
                );
              }
              return (
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
                        <span className="font-mono text-lg font-bold text-white block mt-1 tracking-wider">{invite.code}</span>
                      </div>
                      <Button
                        onClick={() => handleCopyCode(invite.code)}
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
                          {`${typeof window !== "undefined" ? window.location.origin : ""}/signup?code=${invite.code}`}
                        </span>
                      </div>
                      <Button
                        onClick={() => handleCopyLink(invite.code)}
                        variant="outline"
                        className="border-neutral-800 text-xs h-9 px-3 hover:bg-neutral-800 hover:text-white transition-colors"
                      >
                        {copiedLink ? "Link Copied! ✓" : "Copy Link"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Payment Ledger Section */}
            <div className="pt-6 border-t border-neutral-800 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="font-bold text-white text-xl">Payment history</h3>
                  <p className="text-neutral-400 text-sm mt-0.5">Track rent payments, pending approvals, and disputes.</p>
                </div>
                <div className="flex items-center gap-3 self-start sm:self-auto">
                  {/* Year filter */}
                  <Select
                    id="landlord-ledger-year-filter"
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
                            setSelectedPaymentLeaseId(currentLease?.id || "");
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
                      <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Rent due so far</span>
                      <span className="text-lg font-bold text-white block">
                        {!billingSummary.isRentSet ? "Rent not set" : formatCurrency(billingSummary.rentDueToDate)}
                      </span>
                      {billingSummary.isRentSet && (
                        <span className="block text-xs text-neutral-400">
                          {billingSummary.periodsDue} {billingSummary.periodsDue === 1 ? "period" : "periods"} since {new Date(activeLease.startDate).toLocaleDateString("en-GB")}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Paid (confirmed)</span>
                      <span className="text-lg font-bold text-white block">
                        {!billingSummary.isRentSet ? "Rent not set" : formatCurrency(billingSummary.paidToDate)}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Outstanding</span>
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
                      activeLease.endDate,
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
                            {formatCurrency(billingSummary.pendingAmount)} pending your confirmation
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Payments Ledger List */}
              {(() => {
                const getLandlordPaymentMenuItems = (p: NonNullable<typeof payments>[number]): ActionMenuItem[] => {
                  const hasTenantDispute = p.disputedByTenant && !p.disputedByResolvedAt;
                  const isResolved = p.status === "confirmed" || p.status === "disputed";
                  const disabledTooltip = p.status === "confirmed" ? "Already confirmed" : "Already rejected";

                  const items: ActionMenuItem[] = [
                    {
                      label: "Confirm payment",
                      icon: <Check className="w-4 h-4" />,
                      onClick: () => confirmPayment.mutate({ paymentId: p.id }),
                      disabled: isResolved,
                      disabledTooltip,
                    },
                    {
                      label: "Reject payment",
                      icon: <X className="w-4 h-4" />,
                      variant: "danger",
                      onClick: () => {
                        setRejectPaymentId(p.id);
                        setRejectReason("");
                        setIsRejectOpen(true);
                      },
                      disabled: isResolved,
                      disabledTooltip,
                    },
                  ];

                  if (hasTenantDispute) {
                    items.push({
                      label: "Correct details",
                      icon: <Pencil className="w-4 h-4" />,
                      separatorBefore: true,
                      onClick: () => {
                        setEditPaymentId(p.id);
                        setEditAmount(formatInputNumber(String(p.amount)));
                        setEditPaymentDate(new Date(p.paymentDate).toISOString().split("T")[0]);
                        setEditMethod(p.method);
                        setEditAction("edit");
                        setIsEditOpen(true);
                      },
                    });
                    items.push({
                      label: "Void payment",
                      icon: <Trash2 className="w-4 h-4" />,
                      variant: "danger",
                      onClick: () => setPaymentToVoid(p.id),
                    });
                  }

                  return items;
                };

                return (
                  <>
                    {/* Desktop Table (>= 640px) */}
                    <div className="hidden sm:block overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/20">
                      <table className="min-w-full divide-y divide-neutral-800">
                        <thead className="bg-neutral-900/50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">Date Logged</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">Amount</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">Method</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-center text-xs font-semibold text-neutral-400 uppercase tracking-wider">Actions</th>
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
                                {!payments || payments.length === 0 ? "No payments recorded yet." : `No payments recorded for ${selectedYear}.`}
                              </td>
                            </tr>
                          ) : (
                            filteredPayments.map((p) => {
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
                                  </td>
                                  <td className="px-6 py-4 text-sm font-semibold text-white">
                                    {formatCurrency(p.amount)}
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
                                        {hasTenantDispute && (
                                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-950/40 text-rose-400 border border-rose-900/50">
                                            Flagged
                                          </span>
                                        )}
                                      </div>
                                      {p.counterVerifiedAt && (
                                        <span className="text-[11px] text-green-500 font-medium">
                                          ✓ Acknowledged by tenant
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-sm text-center" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-center">
                                      <ActionMenu
                                        items={getLandlordPaymentMenuItems(p)}
                                        label="Payment actions"
                                      />
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Stacked Cards (< 640px) */}
                    <div className="sm:hidden space-y-2">
                      {isLoadingPayments ? (
                        [...Array(3)].map((_, i) => (
                          <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-4 space-y-2 animate-pulse">
                            <div className="flex justify-between items-center">
                              <Skeleton className="h-5 w-24" />
                              <Skeleton className="h-8 w-8 rounded-lg" />
                            </div>
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-5 w-20 rounded-full" />
                          </div>
                        ))
                      ) : filteredPayments.length === 0 ? (
                        <div className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-8 text-center text-sm text-neutral-500 italic">
                          {!payments || payments.length === 0 ? "No payments recorded yet." : `No payments recorded for ${selectedYear}.`}
                        </div>
                      ) : (
                        filteredPayments.map((p) => {
                          const hasTenantDispute = p.disputedByTenant && !p.disputedByResolvedAt;
                          return (
                            <div
                              key={p.id}
                              onClick={() => {
                                setSelectedLandlordPayment(p);
                                setIsLandlordPaymentDetailOpen(true);
                              }}
                              className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-4 space-y-2 cursor-pointer hover:bg-neutral-900/40 hover:border-neutral-700 transition-colors"
                            >
                              {/* Top line: amount on left, ActionMenu ⋯ on right */}
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-white text-base">
                                  {formatCurrency(p.amount)}
                                </span>
                                <div onClick={(e) => e.stopPropagation()}>
                                  <ActionMenu
                                    items={getLandlordPaymentMenuItems(p)}
                                    label="Payment actions"
                                  />
                                </div>
                              </div>

                              {/* Second line: date and method, muted */}
                              <div className="text-xs text-neutral-400 capitalize">
                                {new Date(p.paymentDate).toLocaleDateString()} · {p.method.replace('_', ' ')}
                              </div>

                              {/* Bottom: status pill + Flagged pill */}
                              <div className="flex items-center space-x-2 pt-1 border-t border-neutral-800/40">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                                  p.status === "confirmed"
                                    ? "bg-green-950/30 text-green-400 border-green-900/30"
                                    : p.status === "disputed"
                                    ? "bg-red-950/30 text-red-400 border-red-900/30"
                                    : "bg-yellow-950/30 text-yellow-400 border-yellow-900/30"
                                }`}>
                                  {paymentStatusLabel[p.status] ?? p.status}
                                </span>
                                {hasTenantDispute && (
                                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-950/40 text-rose-400 border border-rose-900/50">
                                    Flagged
                                  </span>
                                )}
                                {p.counterVerifiedAt && (
                                  <span className="text-[11px] text-green-500 font-medium">
                                    ✓ Acknowledged
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Tenant Chat Section is disabled/hidden per visibility request */}
            {/*
            <div className="pt-6 border-t border-neutral-800 space-y-6">
              <div>
                <h3 className="font-bold text-white text-xl">Tenant Chat</h3>
                <p className="text-neutral-400 text-sm mt-0.5">Send messages and chat with the tenant of this unit.</p>
              </div>
              <Button
                onClick={() => chatWidget.open(unitId)}
                className="bg-white text-neutral-950 hover:bg-neutral-200"
              >
                Chat with Tenant
              </Button>
            </div>
            */}

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
              Invite Tenants
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
                  <Select
                    id="editUnitType"
                    value={editUnitType}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditUnitType(val);
                      if (!isResidentialUnitType(val)) {
                        setEditRoomsCount("");
                      }
                    }}
                    className="mt-1 h-[38px] text-sm"
                  >
                    {allowedUnitTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </Select>
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
                    type="text"
                    inputMode="decimal"
                    value={renewRentAmount}
                    onChange={(e) => setRenewRentAmount(formatInputNumber(e.target.value))}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                    placeholder="e.g. 150,000"
                  />
                </div>
                <div>
                  <label htmlFor="renewRentFrequency" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Frequency
                  </label>
                  <Select
                    id="renewRentFrequency"
                    value={renewRentFrequency}
                    onChange={(e) => setRenewRentFrequency(e.target.value as RentFrequency)}
                    className="mt-1 h-10 text-sm"
                  >
                    {Object.values(RentFrequency).map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <label htmlFor="renewDepositAmount" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Security Deposit (₦) <span className="text-neutral-500 normal-case font-normal">— optional</span>
                </label>
                <input
                  id="renewDepositAmount"
                  type="text"
                  inputMode="decimal"
                  value={renewDepositAmount}
                  onChange={(e) => setRenewDepositAmount(formatInputNumber(e.target.value))}
                  className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                  placeholder="e.g. 300,000"
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
                      Tenant Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="tenantName"
                      type="text"
                      required
                      value={tenantName}
                      onChange={(e) => {
                        setTenantName(e.target.value);
                        if (tenantNameError) setTenantNameError(null);
                      }}
                      className={cn(
                        "mt-1 block w-full rounded-lg border bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:outline-none focus:ring-1 text-sm",
                        tenantNameError
                          ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                          : "border-neutral-800 focus:border-neutral-700 focus:ring-neutral-700"
                      )}
                      placeholder="e.g. Sandra Okon"
                    />
                    {tenantNameError && (
                      <p className="mt-1 text-xs text-red-500">{tenantNameError}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="tenantEmail" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Tenant Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="tenantEmail"
                      type="email"
                      required
                      value={tenantEmail}
                      onChange={(e) => {
                        setTenantEmail(e.target.value);
                        if (tenantEmailError) setTenantEmailError(null);
                      }}
                      className={cn(
                        "mt-1 block w-full rounded-lg border bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:outline-none focus:ring-1 text-sm",
                        tenantEmailError
                          ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                          : "border-neutral-800 focus:border-neutral-700 focus:ring-neutral-700"
                      )}
                      placeholder="sandra@example.com"
                    />
                    {tenantEmailError && (
                      <p className="mt-1 text-xs text-red-500">{tenantEmailError}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="startDate" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Start Date <span className="text-neutral-500 font-normal lowercase">(optional)</span>
                    </label>
                    <input
                      id="startDate"
                      type="date"
                      value={startDate}
                      onChange={(e) => handleStartDateChange(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-[38px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="endDate" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      End Date <span className="text-neutral-500 font-normal lowercase">(optional)</span>
                    </label>
                    <input
                      id="endDate"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-[38px]"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="rentAmount" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Rent Amount (₦) <span className="text-neutral-500 font-normal lowercase">(optional)</span>
                  </label>
                  <input
                    id="rentAmount"
                    type="text"
                    inputMode="decimal"
                    value={rentAmount}
                    onChange={(e) => setRentAmount(formatInputNumber(e.target.value))}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                    placeholder="e.g. 150,000 (can be left blank / TBD)"
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
                      type="text"
                      inputMode="decimal"
                      value={editRentAmount}
                      onChange={(e) => setEditRentAmount(formatInputNumber(e.target.value))}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                      placeholder="e.g. 150,000"
                    />
                  </div>
                  <div>
                    <label htmlFor="editRentFrequency" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Frequency
                    </label>
                    <Select
                      id="editRentFrequency"
                      value={editRentFrequency}
                      onChange={(e) => setEditRentFrequency(e.target.value as RentFrequency)}
                      className="mt-1 h-[38px] text-sm"
                    >
                      <option value={RentFrequency.monthly}>Monthly</option>
                      <option value={RentFrequency.quarterly}>Quarterly</option>
                      <option value={RentFrequency.annually}>Annually</option>
                    </Select>
                  </div>
                </div>

                <div>
                  <label htmlFor="editDepositAmount" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Deposit Amount (₦) - Optional
                  </label>
                  <input
                    id="editDepositAmount"
                    type="text"
                    inputMode="decimal"
                    value={editDepositAmount}
                    onChange={(e) => setEditDepositAmount(formatInputNumber(e.target.value))}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                    placeholder="e.g. 50,000"
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
              <h2 className="text-xl font-bold text-white font-sans">Add Payment</h2>
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

              {nextLease && currentLease && (
                <div>
                  <label htmlFor="paymentLease" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Lease
                  </label>
                  <Select
                    id="paymentLease"
                    value={selectedPaymentLeaseId || currentLease.id}
                    onChange={(e) => setSelectedPaymentLeaseId(e.target.value)}
                    className="mt-1 h-10 text-sm"
                  >
                    <option value={currentLease.id}>
                      Current · {formatDateGB(currentLease.startDate)} – {formatDateGB(currentLease.endDate)}
                    </option>
                    <option value={nextLease.id}>
                      Next · {formatDateGB(nextLease.startDate)} – {formatDateGB(nextLease.endDate)}
                    </option>
                  </Select>
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
                {selectedPaymentLeaseId === nextLease?.id ? (
                  <span className="text-xs text-neutral-400 block mt-1">
                    {formatCurrency(nextLease.rentAmount)} left on this lease
                  </span>
                ) : (
                  billingSummary && billingSummary.isRentSet && (
                    <span className="text-xs text-neutral-400 block mt-1">
                      {formatCurrency(billingSummary.remainingLeaseRent)} left on this lease
                    </span>
                  )
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
                  {createPayment.isPending ? "Adding..." : "Add Payment"}
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
                  toast("Reason is required", "error");
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl space-y-6 flex flex-col my-auto">
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

              {selectedLandlordPayment.proofUrl ? (
                <div>
                  <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Proof Document</span>
                  <div className="mt-2 flex flex-col items-start gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleViewPaymentProof(selectedLandlordPayment.proofUrl!)}
                      className="inline-flex items-center text-xs text-white hover:underline bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-neutral-800"
                    >
                      View / Download Proof
                    </button>
                    {selectedLandlordPayment.status === "pending" ? (
                      <button
                        type="button"
                        onClick={() => setIsDeletePaymentProofConfirmOpen(true)}
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
              ) : selectedLandlordPayment.status === "pending" ? (
                <div>
                  <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Proof Document</span>
                  <div className="mt-2">
                    <label className="block">
                      <span className="sr-only">Upload proof document</span>
                      <input
                        type="file"
                        accept=".pdf, image/*"
                        onChange={handleLandlordProofUpload}
                        disabled={uploadingPaymentProof}
                        className="block w-full text-xs text-neutral-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-white file:text-neutral-950 hover:file:bg-neutral-200 file:cursor-pointer disabled:opacity-50"
                      />
                    </label>
                    {uploadingPaymentProof && <p className="text-xs text-neutral-400 mt-1 animate-pulse">Uploading file...</p>}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="pt-4 border-t border-neutral-800 space-y-3">
              {/* Inline Confirm/Reject — shown only for pending payments */}
              {selectedLandlordPayment.status === 'pending' && (
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={() => confirmPayment.mutate({ paymentId: selectedLandlordPayment.id })}
                    disabled={confirmPayment.isPending || rejectPayment.isPending}
                    className="w-full sm:flex-1 bg-green-600 hover:bg-green-500 text-white font-semibold h-[38px] text-sm"
                  >
                    {confirmPayment.isPending ? 'Confirming…' : 'Confirm Payment'}
                  </Button>
                  <Button
                    onClick={() => {
                      setRejectPaymentId(selectedLandlordPayment.id);
                      setRejectReason('');
                      setIsLandlordPaymentDetailOpen(false);
                      setIsRejectOpen(true);
                    }}
                    disabled={confirmPayment.isPending || rejectPayment.isPending}
                    variant="outline"
                    className="w-full sm:flex-1 border-neutral-800 text-red-400 hover:bg-red-950/20 hover:border-red-900/30 font-semibold h-[38px] text-sm"
                  >
                    Reject
                  </Button>
                </div>
              )}
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
                <Select
                  id="editAction"
                  value={editAction}
                  onChange={(e) => setEditAction(e.target.value as "edit" | "void")}
                  className="mt-1 h-10 text-sm"
                >
                  <option value="edit">Correct Details & Keep Confirmed</option>
                  <option value="void">Void Payment Entirely</option>
                </Select>
              </div>

              {editAction === "edit" ? (
                <>
                  <div>
                    <label htmlFor="editAmount" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Corrected Amount (₦)
                    </label>
                    <input
                      id="editAmount"
                      type="text"
                      inputMode="decimal"
                      required
                      value={editAmount}
                      onChange={(e) => setEditAmount(formatInputNumber(e.target.value))}
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
                    <Select
                      id="editMethod"
                      value={editMethod}
                      onChange={(e) => setEditMethod(e.target.value as PaymentMethod)}
                      className="mt-1 h-10 text-sm"
                    >
                      <option value={PaymentMethod.cash}>Cash</option>
                      <option value={PaymentMethod.bank_transfer}>Bank Transfer</option>
                      <option value={PaymentMethod.cheque}>Cheque</option>
                      <option value={PaymentMethod.other}>Other</option>
                    </Select>
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

      {/* Remove Payment Proof Dialog */}
      <ConfirmDialog
        isOpen={isDeletePaymentProofConfirmOpen}
        onClose={() => setIsDeletePaymentProofConfirmOpen(false)}
        onConfirm={async () => {
          if (selectedLandlordPayment) {
            await deletePaymentProofMutation.mutateAsync({ paymentId: selectedLandlordPayment.id });
          }
        }}
        title="Remove payment proof?"
        description="Are you sure you want to remove this proof document?"
        confirmText="Remove"
        variant="danger"
        isLoading={deletePaymentProofMutation.isPending}
      />

      {/* Delete Unit Dialog */}
      <ConfirmDialog
        isOpen={isDeleteUnitConfirmOpen}
        onClose={() => setIsDeleteUnitConfirmOpen(false)}
        onConfirm={async () => {
          setDeleteError(null);
          try {
            await deleteUnit.mutateAsync({ id: unitId });
            setIsDeleteUnitConfirmOpen(false);
          } catch {
            // handled
          }
        }}
        title={`Delete Unit ${unit?.unitNumber || ""}?`}
        description="Are you sure you want to delete this unit? This action is permanent."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={deleteUnit.isPending}
      />

      {/* Void Payment Dialog */}
      <ConfirmDialog
        isOpen={Boolean(paymentToVoid)}
        onClose={() => setPaymentToVoid(null)}
        onConfirm={async () => {
          if (!paymentToVoid) return;
          try {
            await resolvePayment.mutateAsync({
              paymentId: paymentToVoid,
              action: "void",
            });
            setPaymentToVoid(null);
          } catch {
            // handled
          }
        }}
        title="Void Payment?"
        description="Are you sure you want to void this payment record? This will exclude it from outstanding balance calculations."
        confirmText="Void"
        cancelText="Cancel"
        variant="danger"
        isLoading={resolvePayment.isPending}
      />

      {/* Delete Lease Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteLeaseConfirmId)}
        onClose={() => setDeleteLeaseConfirmId(null)}
        onConfirm={async () => {
          if (!deleteLeaseConfirmId) return;
          try {
            await deleteLease.mutateAsync({ id: deleteLeaseConfirmId });
          } catch {
            // handled
          }
        }}
        title="Delete Lease?"
        description="Are you sure you want to delete this upcoming lease? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={deleteLease.isPending}
      />
    </div>
  );
}
