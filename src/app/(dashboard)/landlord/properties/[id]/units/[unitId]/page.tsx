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
import { X, Trash2, Plus, Pencil, Check, LogOut, RefreshCw } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { useChatWidget } from "@/components/ChatWidgetContext";
import { isResidentialUnitType, getUnitTypesByPropertyType } from "@/lib/unit-types";
import { formatCurrency, formatInputNumber } from "@/lib/utils";
import { formatDateGB } from "@/lib/billing";
import { getCurrentLease, getRenewEligibility, defaultEndDate } from "@/lib/leases";
import { formatRentFrequency, RENT_FREQUENCY_OPTIONS } from "@/lib/rent";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalField } from "@/components/ui/modal";
import { Checkbox } from "@/components/ui/checkbox";
import { LeaseDocumentsCard } from "@/components/documents/LeaseDocumentsCard";
import { InviteCard } from "@/components/leases/InviteCard";
import { LeasePeriodDropdown, type LeaseOption } from "@/components/leases/LeasePeriodDropdown";
import { UnitHeaderCard } from "@/components/leases/UnitHeaderCard";
import { BillingSummaryCard } from "@/components/leases/BillingSummaryCard";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

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

  // Leases: current and selected lease
  const leases = leaseData?.leases;
  const currentLease = leaseData?.currentLease ?? getCurrentLease(leases);
  const leaseParam = searchParams?.get("lease");
  const selectedLease = useMemo(() => {
    if (!leases || leases.length === 0) return currentLease;
    if (leaseParam) {
      const match = leases.find((l) => l.id === leaseParam);
      if (match) return match;
    }
    return currentLease || leases[0];
  }, [leases, leaseParam, currentLease]);

  const activeLease = selectedLease;
  const pendingLease = leaseData?.pendingLease ?? unitStatus?.pendingLease;

  const [cancelInvitationConfirmId, setCancelInvitationConfirmId] = useState<string | null>(null);

  const resendInvitation = trpc.leases.resendInvitation.useMutation({
    onSuccess: () => {
      utils.leases.getForUnit.invalidate({ unitId });
      utils.units.getStatus.invalidate({ id: unitId });
      toast("Invitation resent", "success");
    },
    onError: (err) => {
      toast(err.message, "error");
    },
  });

  const cancelInvitation = trpc.leases.cancelInvitation.useMutation({
    onSuccess: () => {
      utils.leases.getForUnit.invalidate({ unitId });
      utils.units.getStatus.invalidate({ id: unitId });
      utils.properties.list.invalidate();
      toast("Invitation cancelled", "success");
      setCancelInvitationConfirmId(null);
    },
    onError: (err) => {
      toast(err.message, "error");
    },
  });

  const [isCancelCodeInviteOpen, setIsCancelCodeInviteOpen] = useState(false);
  const [isEditTenantOpen, setIsEditTenantOpen] = useState(false);
  const [editTenantFullName, setEditTenantFullName] = useState("");
  const [editTenantEmail, setEditTenantEmail] = useState("");
  const [editTenantError, setEditTenantError] = useState<string | null>(null);

  const regenerateInviteCodeMutation = trpc.leases.regenerateInviteCode.useMutation({
    onSuccess: (data) => {
      toast(`New code ready. Share it with ${data.tenantName}.`, "success");
      utils.leases.getForUnit.invalidate({ unitId });
      utils.units.getStatus.invalidate({ id: unitId });
    },
    onError: (err) => {
      toast(err.message, "error");
    },
  });

  const updatePlaceholderTenantMutation = trpc.leases.updatePlaceholderTenant.useMutation({
    onSuccess: () => {
      toast("Tenant details updated", "success");
      setIsEditTenantOpen(false);
      utils.leases.getForUnit.invalidate({ unitId });
      utils.units.getStatus.invalidate({ id: unitId });
    },
    onError: (err) => {
      setEditTenantError(err.message);
    },
  });

  const cancelCodeInviteMutation = trpc.leases.cancelCodeInvite.useMutation({
    onSuccess: () => {
      toast("Invite cancelled", "success");
      setIsCancelCodeInviteOpen(false);
      utils.leases.getForUnit.invalidate({ unitId });
      utils.units.getStatus.invalidate({ id: unitId });
      utils.properties.list.invalidate();
    },
    onError: (err) => {
      toast(err.message, "error");
    },
  });

  const codeInvite = activeLease?.inviteCodes?.[0];
  const hasUnredeemedCode = Boolean(codeInvite && !codeInvite.redeemedAt);
  const isCodeExpired = Boolean(hasUnredeemedCode && new Date(codeInvite!.expiresAt) <= new Date());

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
    onSuccess: (data) => {
      utils.leases.getForUnit.invalidate({ unitId });
      utils.units.getStatus.invalidate({ id: unitId });
      utils.properties.list.invalidate();
      if (activeLease) {
        utils.leases.getTimeline.invalidate({ leaseId: activeLease.id });
      }
      setIsRenewLeaseOpen(false);
      resetRenewForm();
      toast("Lease renewed", "success");
      // Set new lease in URL
      const currentUrlParams = new URLSearchParams(window.location.search);
      currentUrlParams.set("lease", data.lease.id);
      router.push(`${window.location.pathname}?${currentUrlParams.toString()}`);
    },
    onError: (err) => {
      setRenewError(err.message);
    },
  });

  const [isMovedOutConfirmOpen, setIsMovedOutConfirmOpen] = useState(false);
  const markMovedOutMutation = trpc.leases.markMovedOut.useMutation({
    onSuccess: () => {
      utils.leases.getForUnit.invalidate({ unitId });
      utils.units.getStatus.invalidate({ id: unitId });
      utils.properties.list.invalidate();
      if (activeLease) {
        utils.leases.getTimeline.invalidate({ leaseId: activeLease.id });
      }
      setIsMovedOutConfirmOpen(false);
      toast("Marked as moved out", "success");
    },
    onError: (err) => {
      toast(err.message, "error");
    },
  });

  const [isEditLeaseOpen, setIsEditLeaseOpen] = useState(false);
  const [editRentAmount, setEditRentAmount] = useState("");
  const [editRentFrequency, setEditRentFrequency] = useState<RentFrequency>(RentFrequency.annually);
  const [editDepositAmount, setEditDepositAmount] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editNoFixedEndDate, setEditNoFixedEndDate] = useState(false);
  const [lastAutoEditEndDate, setLastAutoEditEndDate] = useState("");
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

  const handleOpenEditLease = (leaseToEdit?: typeof currentLease | unknown) => {
    const target = (leaseToEdit && typeof leaseToEdit === "object" && "rentAmount" in leaseToEdit)
      ? (leaseToEdit as typeof currentLease)
      : currentLease;
    if (target) {
      setEditingLeaseId(target.id);
      setEditRentAmount(Number(target.rentAmount) === 0 ? "" : formatInputNumber(target.rentAmount.toString()));
      setEditRentFrequency(target.rentFrequency);
      setEditDepositAmount(target.depositAmount ? formatInputNumber(target.depositAmount.toString()) : "");
      setEditStartDate(new Date(target.startDate).toISOString().split("T")[0]);
      if (target.endDate) {
        setEditEndDate(new Date(target.endDate).toISOString().split("T")[0]);
        setEditNoFixedEndDate(false);
        setLastAutoEditEndDate("");
      } else {
        setEditEndDate("");
        setEditNoFixedEndDate(true);
        setLastAutoEditEndDate("");
      }
      setEditLeaseError(null);
      setIsEditLeaseOpen(true);
    }
  };

  const handleEditStartDateChange = (val: string) => {
    setEditStartDate(val);
    if (!editNoFixedEndDate && val && (editEndDate === "" || editEndDate === lastAutoEditEndDate)) {
      const def = defaultEndDate(val);
      setEditEndDate(def);
      setLastAutoEditEndDate(def);
    }
  };

  const handleToggleEditNoFixedEndDate = (checked: boolean) => {
    setEditNoFixedEndDate(checked);
    if (checked) {
      setEditEndDate("");
    } else {
      const def = defaultEndDate(editStartDate);
      setEditEndDate(def);
      setLastAutoEditEndDate(def);
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
        endDate: editNoFixedEndDate ? null : (editEndDate || null),
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
  const [debouncedTenantEmail, setDebouncedTenantEmail] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTenantEmail(tenantEmail.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [tenantEmail]);

  const { data: tenantEmailCheck } = trpc.leases.lookupTenantEmail.useQuery(
    { email: debouncedTenantEmail },
    { enabled: debouncedTenantEmail.includes("@") && debouncedTenantEmail.length > 3 }
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [noFixedEndDate, setNoFixedEndDate] = useState(false);
  const [lastAutoEndDate, setLastAutoEndDate] = useState("");
  const [rentAmount, setRentAmount] = useState("");
  const [rentFrequency, setRentFrequency] = useState<RentFrequency | "">("");
  const [rentAmountError, setRentAmountError] = useState<string | null>(null);
  const [rentFrequencyError, setRentFrequencyError] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [leaseError, setLeaseError] = useState<string | null>(null);

  // Payment Proof File Upload State
  const [isDeletePaymentProofConfirmOpen, setIsDeletePaymentProofConfirmOpen] = useState(false);
  const [uploadingPaymentProof, setUploadingPaymentProof] = useState(false);

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

  // Renew eligibility
  const today = useMemo(() => new Date(), []);
  const renewEligibility = useMemo(() => {
    if (!activeLease || !payments) return { eligible: false, reason: "not_ended" as const };
    const confirmed = payments.filter((p) => p.status === "confirmed");
    return getRenewEligibility(activeLease, confirmed, today, leases);
  }, [activeLease, payments, today, leases]);

  // Options for LeasePeriodDropdown
  const leaseDropdownOptions: LeaseOption[] = useMemo(() => {
    if (!leases) return [];
    return leases.map((l) => {
      let status: LeaseOption["status"] = "ended";
      if (currentLease && l.id === currentLease.id && !l.terminatedAt && (!l.endDate || new Date(l.endDate) > today)) {
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
        tenantName: l.tenant?.fullName,
        status,
      };
    });
  }, [leases, currentLease, today]);

  // Payments visible in the current lease selection
  const filteredPayments = useMemo(() => {
    return payments || [];
  }, [payments]);

  // Human-readable status labels
  const paymentStatusLabel: Record<string, string> = {
    confirmed: "Confirmed",
    pending: "Pending",
    disputed: "Rejected",
  };

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (!noFixedEndDate && val && (endDate === "" || endDate === lastAutoEndDate)) {
      const def = defaultEndDate(val);
      setEndDate(def);
      setLastAutoEndDate(def);
    }
  };

  const handleToggleNoFixedEndDate = (checked: boolean) => {
    setNoFixedEndDate(checked);
    if (checked) {
      setEndDate("");
    } else {
      const def = defaultEndDate(startDate);
      setEndDate(def);
      setLastAutoEndDate(def);
    }
  };

  const resetLeaseForm = () => {
    setTenantName("");
    setTenantEmail("");
    setTenantNameError(null);
    setTenantEmailError(null);
    setStartDate("");
    setEndDate("");
    setNoFixedEndDate(false);
    setLastAutoEndDate("");
    setRentAmount("");
    setRentFrequency("");
    setRentAmountError(null);
    setRentFrequencyError(null);
    setDepositAmount("");
    setLeaseError(null);
  };

  // Renew Lease State
  const [isRenewLeaseOpen, setIsRenewLeaseOpen] = useState(false);
  const [renewStartDate, setRenewStartDate] = useState("");
  const [renewEndDate, setRenewEndDate] = useState("");
  const [renewNoFixedEndDate, setRenewNoFixedEndDate] = useState(false);
  const [lastAutoRenewEndDate, setLastAutoRenewEndDate] = useState("");
  const [renewRentAmount, setRenewRentAmount] = useState("");
  const [renewRentFrequency, setRenewRentFrequency] = useState<RentFrequency>(RentFrequency.annually);
  const [renewDepositAmount, setRenewDepositAmount] = useState("");
  const [renewError, setRenewError] = useState<string | null>(null);

  const resetRenewForm = () => {
    setRenewStartDate("");
    setRenewEndDate("");
    setRenewNoFixedEndDate(false);
    setLastAutoRenewEndDate("");
    setRenewRentAmount("");
    setRenewRentFrequency(RentFrequency.annually);
    setRenewDepositAmount("");
    setRenewError(null);
  };

  const handleOpenRenewLease = () => {
    if (!activeLease) return;
    const newStart = activeLease.endDate
      ? new Date(activeLease.endDate).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];
    setRenewStartDate(newStart);
    const def = defaultEndDate(newStart);
    setRenewEndDate(def);
    setLastAutoRenewEndDate(def);
    setRenewNoFixedEndDate(false);

    setRenewRentAmount(Number(activeLease.rentAmount) === 0 ? "" : formatInputNumber(activeLease.rentAmount.toString()));
    setRenewRentFrequency(activeLease.rentFrequency);
    setRenewDepositAmount(activeLease.depositAmount ? formatInputNumber(activeLease.depositAmount.toString()) : "");
    setRenewError(null);
    setIsRenewLeaseOpen(true);
  };

  const handleRenewStartDateChange = (val: string) => {
    setRenewStartDate(val);
    if (!renewNoFixedEndDate && val && (renewEndDate === "" || renewEndDate === lastAutoRenewEndDate)) {
      const def = defaultEndDate(val);
      setRenewEndDate(def);
      setLastAutoRenewEndDate(def);
    }
  };

  const handleToggleRenewNoFixedEndDate = (checked: boolean) => {
    setRenewNoFixedEndDate(checked);
    if (checked) {
      setRenewEndDate("");
    } else {
      const def = defaultEndDate(renewStartDate);
      setRenewEndDate(def);
      setLastAutoRenewEndDate(def);
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
    setRentAmountError(null);
    setRentFrequencyError(null);

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
    } else if (tenantEmailCheck?.isLandlord) {
      setTenantEmailError("This email belongs to a landlord account. Use the tenant's personal email.");
      hasError = true;
    }

    const rent = rentAmount ? parseFloat(rentAmount.replace(/,/g, "")) : undefined;
    const deposit = depositAmount ? parseFloat(depositAmount.replace(/,/g, "")) : undefined;

    if (!rentAmount || isNaN(rent!) || rent! <= 0) {
      setRentAmountError("Enter the rent amount");
      hasError = true;
    }
    if (!rentFrequency) {
      setRentFrequencyError("Choose how often rent is paid");
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
        rentAmount: rent!,
        rentFrequency: rentFrequency as RentFrequency,
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

    if (billingSummary && billingSummary.isRentSet && amount > billingSummary.remainingLeaseRent) {
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
        confirmUpcoming: false,
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
      <div className="min-h-screen bg-background text-foreground">
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
          <div className="rounded-xl border border-border bg-card p-6 backdrop-blur-sm space-y-6">
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-border">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-20 mt-1" />
                </div>
              ))}
            </div>
          </div>

          {/* Lease / Timeline Card */}
          <div className="rounded-xl border border-border bg-card p-6 backdrop-blur-sm space-y-4">
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
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-8 w-28 rounded-md" />
            </div>
            <div className="p-4 border-b border-border flex gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20 ml-auto" />
            </div>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-4 border-b border-border/60 flex items-center justify-between">
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
        <p className="text-lg">Unit not found.</p>
        <Link href="/landlord/properties" className="text-sm underline mt-2">
          Back to properties
        </Link>
      </div>
    );
  }

  const isLeaseEndedState = timeline?.status === "ended" && !activeLease?.terminatedAt;
  const isOpenEndedActive = Boolean(activeLease && !activeLease.endDate && !activeLease.terminatedAt);

  const handleSelectLease = (leaseId: string) => {
    const currentUrlParams = new URLSearchParams(window.location.search);
    currentUrlParams.set("lease", leaseId);
    router.push(`${window.location.pathname}?${currentUrlParams.toString()}`);
  };

  // Visual Timeline math
  let todayPercent = 0;
  if (timeline && timeline.endDate) {
    const startMs = new Date(timeline.startDate).getTime();
    const endMs = new Date(timeline.endDate).getTime();
    const todayMs = new Date().getTime();

    const totalDuration = endMs - startMs;
    const elapsed = Math.max(0, Math.min(totalDuration, todayMs - startMs));
    todayPercent = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;
  }

  // availableYears and filteredPayments are declared above, before the early returns.

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sticky header shows only unit title and notification bell */}
      <PageHeader title={`Unit ${unit.unitNumber}`} />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12 space-y-6">
        <DetailActionRow
          backHref={`/landlord/properties/${propertyId}`}
          backLabel="Back to property"
          phonePrimaryAction={
            isLeaseEndedState ? undefined : activeLease
              ? {
                label: "Add payment",
                icon: <Plus className="w-4 h-4" />,
                disabled: !billingSummary || (!isOpenEndedActive && billingSummary.isRentSet && billingSummary.remainingLeaseRent <= 0),
                title:
                  !isOpenEndedActive && billingSummary && billingSummary.isRentSet && billingSummary.remainingLeaseRent <= 0
                    ? "This lease is fully paid."
                    : undefined,
                onClick: () => {
                  setIsLogPaymentOpen(true);
                  setSelectedPaymentLeaseId(currentLease?.id || activeLease.id);
                  setPaymentAmount(
                    billingSummary && billingSummary.outstanding > 0
                      ? formatInputNumber(String(Math.min(billingSummary.outstanding, billingSummary.remainingLeaseRent || billingSummary.outstanding)))
                      : ""
                  );
                  setPaymentError(null);
                },
              }
              : undefined
          }
          actions={[
            {
              label: "Edit unit",
              onClick: () => handleOpenEditUnit(),
              icon: <Pencil className="w-4 h-4" />,
              variant: "outline" as const,
            },
            {
              label: "Delete unit",
              onClick: () => handleDeleteUnit(),
              icon: <Trash2 className="w-4 h-4" />,
              variant: "danger" as const,
            },
          ]}
        />

        {deleteError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive-tint p-4 text-sm text-destructive">
            {deleteError}
          </div>
        )}

        {/* Unit Header Card */}
        {(() => {
          const headerStatus = isLeaseEndedState || timeline?.status === "ended" || timeline?.status === "moved_out"
            ? "ended"
            : unitStatus?.status === "occupied"
            ? "occupied"
            : unitStatus?.status === "reserved"
            ? "reserved"
            : "vacant";

          const headerPerson = activeLease
            ? { fullName: activeLease.tenant.fullName, email: activeLease.tenant.email }
            : pendingLease
            ? { fullName: pendingLease.tenant.fullName, email: pendingLease.tenant.email }
            : null;

          return (
            <UnitHeaderCard
              viewer="landlord"
              unitNumber={unit.unitNumber}
              propertyName={property.name}
              propertyAddress={property.address ? `${property.address}, ${property.city}` : property.city}
              status={headerStatus}
              person={headerPerson}
            />
          );
        })()}

        {/* Active Lease Section */}
        {activeLease && timeline ? (
          <div className="space-y-6">
            {/* Two cards side by side (Lease Timeline 3fr & Documents 2fr) */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">
              {/* Timeline Display Card */}
              <div className="lg:col-span-3 rounded-xl border border-border bg-card/20 p-5 space-y-6 h-full flex flex-col justify-between">
                {/* Desktop Header (sm and up) */}
                <div className="hidden sm:flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center space-x-3">
                    <h3 className="font-bold text-foreground text-lg">Lease Timeline</h3>
                    <button
                      onClick={() => handleOpenEditLease()}
                      className="text-xs text-muted-foreground hover:text-foreground bg-card border border-border hover:bg-accent px-2 py-1 rounded transition-colors"
                    >
                      Edit details
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    {isLeaseEndedState ? (
                      <>
                        <Button
                          variant="outline"
                          size="action"
                          onClick={() => setIsMovedOutConfirmOpen(true)}
                          className="justify-center"
                        >
                          <LogOut className="w-4 h-4" />
                          Mark as moved out
                        </Button>
                        {!renewEligibility.eligible && renewEligibility.reason === "unpaid" ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block cursor-not-allowed">
                                <Button
                                  variant="default"
                                  size="action"
                                  disabled
                                  className="justify-center opacity-50 pointer-events-none"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                  Renew
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" align="center">
                              {formatCurrency(renewEligibility.unpaidAmount ?? 0)} still unpaid on this lease
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Button
                            variant="default"
                            size="action"
                            onClick={() => handleOpenRenewLease()}
                            disabled={!renewEligibility.eligible}
                            className="justify-center"
                          >
                            <RefreshCw className="w-4 h-4" />
                            Renew
                          </Button>
                        )}
                      </>
                    ) : isOpenEndedActive ? (
                      <>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-success-tint text-success border border-success/20">
                          Active
                        </span>
                        <Button
                          variant="outline"
                          size="action"
                          onClick={() => setIsMovedOutConfirmOpen(true)}
                          className="justify-center"
                        >
                          <LogOut className="w-4 h-4" />
                          Mark as moved out
                        </Button>
                      </>
                    ) : timeline.status === "moved_out" ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted border border-border text-muted-foreground">
                        Moved out
                      </span>
                    ) : timeline.status === "upcoming" ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-tint text-primary border border-primary/20">
                        Upcoming
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-success-tint text-success border border-success/20">
                        Active
                      </span>
                    )}
                  </div>
                </div>

                {/* Mobile Header (under 640px) */}
                <div className="sm:hidden flex flex-col gap-3 w-full">
                  <div className="flex items-center justify-between gap-2 w-full">
                    <div className="flex items-center space-x-3">
                      <h3 className="font-bold text-foreground text-lg">Lease Timeline</h3>
                      <button
                        onClick={() => handleOpenEditLease()}
                        className="text-xs text-muted-foreground hover:text-foreground bg-card border border-border hover:bg-accent px-2 py-1 rounded transition-colors"
                      >
                        Edit details
                      </button>
                    </div>
                    {!isLeaseEndedState && (
                      timeline.status === "moved_out" ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted border border-border text-muted-foreground">
                          Moved out
                        </span>
                      ) : timeline.status === "upcoming" ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-tint text-primary border border-primary/20">
                          Upcoming
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-success-tint text-success border border-success/20">
                          Active
                        </span>
                      )
                    )}
                  </div>
                  {isLeaseEndedState && (
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <Button
                        variant="outline"
                        size="action"
                        onClick={() => setIsMovedOutConfirmOpen(true)}
                        className="w-full justify-center"
                      >
                        <LogOut className="w-4 h-4" />
                        Mark as moved out
                      </Button>
                      {!renewEligibility.eligible && renewEligibility.reason === "unpaid" ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block w-full cursor-not-allowed">
                              <Button
                                variant="default"
                                size="action"
                                disabled
                                className="w-full justify-center opacity-50 pointer-events-none"
                              >
                                <RefreshCw className="w-4 h-4" />
                                Renew
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="center">
                            {formatCurrency(renewEligibility.unpaidAmount ?? 0)} still unpaid on this lease
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Button
                          variant="default"
                          size="action"
                          onClick={() => handleOpenRenewLease()}
                          disabled={!renewEligibility.eligible}
                          className="w-full justify-center"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Renew
                        </Button>
                      )}
                    </div>
                  )}
                  {isOpenEndedActive && (
                    <div className="grid grid-cols-1 gap-2 w-full">
                      <Button
                        variant="outline"
                        size="action"
                        onClick={() => setIsMovedOutConfirmOpen(true)}
                        className="w-full justify-center"
                      >
                        <LogOut className="w-4 h-4" />
                        Mark as moved out
                      </Button>
                    </div>
                  )}
                </div>

                {/* Progress Visual Tracker */}
                <div className="space-y-3 pt-4">
                  {timeline.endDate ? (
                    <div className="relative w-full h-3 rounded-full bg-muted overflow-visible">
                      {/* Elapsed progress tracker */}
                      <div
                        className="absolute top-0 bottom-0 left-0 bg-primary/40 rounded-l-full"
                        style={{ width: `${todayPercent}%` }}
                      />
                      {/* Current day marker dot */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 border-primary bg-primary shadow-md cursor-pointer transition-transform hover:scale-110"
                        style={{ left: `calc(${todayPercent}% - 10px)` }}
                        title="Today"
                      />
                    </div>
                  ) : (
                    <div className="h-1.5 w-full rounded-full bg-muted" />
                  )}

                  <div className="flex justify-between text-xs text-subtle-foreground font-medium pt-1">
                    <span>Start: {formatDateGB(timeline.startDate)}</span>
                    <span>End: {timeline.endDate ? formatDateGB(timeline.endDate) : "Ongoing"}</span>
                  </div>
                </div>

                {/* Summary details */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-border/40 text-sm">
                  <div>
                    <span className="block text-subtle-foreground text-xs">Rent</span>
                    <span className="font-semibold text-foreground mt-0.5 block">
                      {formatCurrency(timeline.rentAmount)} / {formatRentFrequency(timeline.rentFrequency)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-subtle-foreground text-xs">Deposit</span>
                    <span className="font-semibold text-foreground mt-0.5 block">
                      {activeLease.depositAmount ? formatCurrency(activeLease.depositAmount) : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-subtle-foreground text-xs">Invite Status</span>
                    <span className="mt-1 block">
                      {codeInvite ? (
                        codeInvite.redeemedAt ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success-tint text-success border border-success/20">
                            Joined
                          </span>
                        ) : isCodeExpired ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-destructive-tint text-destructive border border-destructive/20">
                            Expired
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning-tint text-warning border border-warning/20">
                            Awaiting tenant
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success-tint text-success border border-success/20">
                          Joined
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Documents Card */}
              <LeaseDocumentsCard leaseId={activeLease.id} mode="landlord" className="lg:col-span-2 h-full" />
            </div>

            {/* Tenant invitation card for landlords to copy/share */}
            {hasUnredeemedCode && codeInvite && (
              <InviteCard
                type="code"
                tenantName={activeLease.tenant.fullName}
                tenantEmail={activeLease.tenant.email}
                expiresAt={codeInvite.expiresAt}
                isExpired={isCodeExpired}
                code={codeInvite.code}
                hasPayments={Boolean(activeLease.payments && activeLease.payments.length > 0)}
                onNewCode={() => regenerateInviteCodeMutation.mutate({ leaseId: activeLease.id })}
                onEditTenant={() => {
                  setEditTenantFullName(activeLease.tenant.fullName);
                  setEditTenantEmail(activeLease.tenant.email);
                  setEditTenantError(null);
                  setIsEditTenantOpen(true);
                }}
                onCancelInvite={() => setIsCancelCodeInviteOpen(true)}
                isLoading={regenerateInviteCodeMutation.isPending}
              />
            )}

            {/* Billing Summary Banner placed ABOVE Payment history */}
            {billingSummary && (
              <BillingSummaryCard
                viewer="landlord"
                billingSummary={billingSummary}
                leaseEndDate={activeLease.endDate}
              />
            )}

            {/* Payment Ledger Section */}
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h3 className="font-bold text-foreground text-xl">Payment history</h3>
                {/* Mobile: Add payment on row above dropdown */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
                  <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                    <div className="sm:hidden text-sm font-semibold text-muted-foreground">
                      Payment history
                    </div>
                    {(() => {
                      const isPaidInFull = Boolean(activeLease?.endDate && billingSummary && billingSummary.isRentSet && billingSummary.remainingLeaseRent <= 0);
                      return isPaidInFull ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex cursor-not-allowed">
                              <Button
                                disabled
                                size="action"
                                className="bg-primary text-primary-foreground opacity-50 pointer-events-none"
                              >
                                <Plus className="w-4 h-4" />
                                Add payment
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="center">
                            This lease is fully paid.
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Button
                          onClick={() => {
                            setIsLogPaymentOpen(true);
                            setSelectedPaymentLeaseId(activeLease?.id || currentLease?.id || "");
                            setPaymentAmount(
                              billingSummary?.outstanding
                                ? formatInputNumber(String(Math.min(billingSummary.outstanding, billingSummary.remainingLeaseRent || billingSummary.outstanding)))
                                : ""
                            );
                            setPaymentError(null);
                          }}
                          size="action"
                          className="bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                          <Plus className="w-4 h-4" />
                          Add payment
                        </Button>
                      );
                    })()}
                  </div>

                  {/* Lease period dropdown */}
                  <div className="w-full sm:w-auto">
                    <LeasePeriodDropdown
                      leases={leaseDropdownOptions}
                      selectedLeaseId={activeLease?.id || ""}
                      onSelectLease={handleSelectLease}
                      isLandlord={true}
                    />
                  </div>
                </div>
              </div>

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
                    <div className="hidden sm:block overflow-x-auto rounded-xl border border-border bg-card/20">
                      <table className="min-w-full divide-y divide-border">
                        <thead className="bg-muted">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Date Logged</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Amount</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Method</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Status</th>
                            <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
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
                              <td colSpan={5} className="px-6 py-8 text-center text-sm text-subtle-foreground italic">
                                {!payments || payments.length === 0 ? "No payments recorded yet." : "No payments recorded for this lease."}
                              </td>
                            </tr>
                          ) : (
                            filteredPayments.map((p) => {
                              const hasTenantDispute = p.disputedByTenant && !p.disputedByResolvedAt;

                              return (
                                <tr
                                  key={p.id}
                                  className="hover:bg-accent/40 transition-colors cursor-pointer"
                                  onClick={() => {
                                    setSelectedLandlordPayment(p);
                                    setIsLandlordPaymentDetailOpen(true);
                                  }}
                                >
                                  <td className="px-6 py-4 text-sm text-foreground/80 whitespace-nowrap">
                                    {formatDateGB(p.paymentDate)}
                                  </td>
                                  <td className="px-6 py-4 text-sm font-semibold text-foreground whitespace-nowrap">
                                    {formatCurrency(p.amount)}
                                  </td>
                                  <td className="px-6 py-4 text-sm text-muted-foreground capitalize whitespace-nowrap">
                                    {p.method.replace('_', ' ')}
                                  </td>
                                  <td className="px-6 py-4 text-sm whitespace-nowrap">
                                    <div className="flex flex-col space-y-1">
                                      <div className="flex items-center space-x-2">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${p.status === "confirmed"
                                          ? "bg-success-tint text-success border-success/30"
                                          : p.status === "disputed"
                                            ? "bg-destructive-tint text-destructive border-destructive/30"
                                            : "bg-warning-tint text-warning border-warning/30"
                                          }`}>
                                          {paymentStatusLabel[p.status] ?? p.status}
                                        </span>
                                        {hasTenantDispute && (
                                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-destructive-tint text-destructive border border-destructive/30">
                                            Flagged
                                          </span>
                                        )}
                                      </div>
                                      {p.counterVerifiedAt && (
                                        <span className="text-[11px] text-success font-medium">
                                          ✓ Acknowledged by tenant
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-sm text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
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
                          <div key={i} className="rounded-xl border border-border bg-card/20 p-4 space-y-2 animate-pulse">
                            <div className="flex justify-between items-center">
                              <Skeleton className="h-5 w-24" />
                              <Skeleton className="h-8 w-8 rounded-lg" />
                            </div>
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-5 w-20 rounded-full" />
                          </div>
                        ))
                      ) : filteredPayments.length === 0 ? (
                        <div className="rounded-xl border border-border bg-card/20 p-8 text-center text-sm text-subtle-foreground italic">
                          {!payments || payments.length === 0 ? "No payments recorded yet." : "No payments recorded for this lease."}
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
                              className="rounded-xl border border-border bg-card/20 p-4 space-y-2 cursor-pointer hover:bg-accent/40 hover:border-border/80 transition-colors"
                            >
                              {/* Top line: amount on left, ActionMenu ⋯ on right */}
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-foreground text-base">
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
                              <div className="text-xs text-muted-foreground capitalize">
                                {formatDateGB(p.paymentDate)} · {p.method.replace('_', ' ')}
                              </div>

                              {/* Bottom: status pill + Flagged pill */}
                              <div className="flex items-center space-x-2 pt-1 border-t border-border/40">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${p.status === "confirmed"
                                  ? "bg-success-tint text-success border-success/30"
                                  : p.status === "disputed"
                                    ? "bg-destructive-tint text-destructive border-destructive/30"
                                    : "bg-warning-tint text-warning border-warning/30"
                                  }`}>
                                  {paymentStatusLabel[p.status] ?? p.status}
                                </span>
                                {hasTenantDispute && (
                                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-destructive-tint text-destructive border border-destructive/30">
                                    Flagged
                                  </span>
                                )}
                                {p.counterVerifiedAt && (
                                  <span className="text-[11px] text-success font-medium">
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
            <div className="pt-6 border-t border-border space-y-6">
              <div>
                <h3 className="font-bold text-foreground text-xl">Tenant Chat</h3>
                <p className="text-muted-foreground text-sm mt-0.5">Send messages and chat with the tenant of this unit.</p>
              </div>
              <Button
                onClick={() => chatWidget.open(unitId)}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Chat with Tenant
              </Button>
            </div>
            */}

          </div>
        ) : pendingLease ? (
          <InviteCard
            type="in_app"
            tenantName={pendingLease.tenant.fullName}
            tenantEmail={pendingLease.tenant.email}
            expiresAt={pendingLease.invitationExpiresAt || pendingLease.createdAt}
            isExpired={Boolean(pendingLease.isExpired)}
            onResendInvite={() => resendInvitation.mutate({ leaseId: pendingLease.id })}
            onCancelInvite={() => setCancelInvitationConfirmId(pendingLease.id)}
            isLoading={resendInvitation.isPending}
          />
        ) : (
          <div className="rounded-xl border border-border bg-card p-12 text-center max-w-xl mx-auto space-y-4">
            <h3 className="text-lg font-medium text-foreground">This unit is vacant</h3>
            <p className="text-muted-foreground text-sm">
              Create a formal tenancy lease to link a tenant to this unit and enable tracking.
            </p>
            <Button
              onClick={() => setIsAddLeaseOpen(true)}
              size="action"
              className="bg-primary text-primary-foreground hover:bg-primary/90 mt-2"
            >
              <Plus className="w-4 h-4" />
              Invite tenant
            </Button>
          </div>
        )}

      </main>

      {/* Edit Unit Modal */}
      <Modal
        open={isEditUnitOpen}
        onOpenChange={(open) => {
          setIsEditUnitOpen(open);
          if (!open) setEditUnitError(null);
        }}
        isSaving={updateUnit.isPending}
        size="md"
      >
        <ModalHeader
          title="Edit Unit"
          onClose={() => {
            setIsEditUnitOpen(false);
            setEditUnitError(null);
          }}
          isSaving={updateUnit.isPending}
        />
        <form onSubmit={handleUpdateUnitSubmit} className="flex flex-col flex-1 min-h-0">
          <ModalBody className="space-y-6">
            {editUnitError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive-tint p-3 text-sm text-destructive">
                {editUnitError}
              </div>
            )}

            <ModalField label="Unit Number / Name" htmlFor="editUnitNumber" required>
              <input
                id="editUnitNumber"
                type="text"
                required
                value={editUnitNumber}
                onChange={(e) => setEditUnitNumber(e.target.value)}
                className="block w-full h-12 rounded-lg field-focus px-4 text-foreground placeholder:text-subtle-foreground text-sm"
                placeholder="e.g. Flat 101, Shop 5"
              />
            </ModalField>

            <ModalField label="Unit Type" htmlFor="editUnitType">
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
                className="h-12 text-sm"
              >
                {allowedUnitTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </ModalField>

            {isResidentialUnitType(editUnitType) && (
              <ModalField label="Number of Rooms" htmlFor="editRoomsCount">
                <input
                  id="editRoomsCount"
                  type="number"
                  min="0"
                  value={editRoomsCount}
                  onChange={(e) => setEditRoomsCount(e.target.value)}
                  placeholder="e.g. 3"
                  className="block w-full h-12 rounded-lg field-focus px-4 text-foreground placeholder:text-subtle-foreground text-sm"
                />
              </ModalField>
            )}
          </ModalBody>

          <ModalFooter
            onCancel={() => {
              setIsEditUnitOpen(false);
              setEditUnitError(null);
            }}
            primaryText="Save Changes"
            isSaving={updateUnit.isPending}
          />
        </form>
      </Modal>

      {/* Renew Lease Modal */}
      <Modal
        open={Boolean(isRenewLeaseOpen && activeLease)}
        onOpenChange={(open) => {
          setIsRenewLeaseOpen(open);
          if (!open) resetRenewForm();
        }}
        isSaving={renewLease.isPending}
        size="lg"
      >
        {activeLease && (
          <>
            <ModalHeader
              title="Renew Lease"
              description="Creates a new lease for the same tenant. The current lease is preserved as history."
              onClose={() => {
                setIsRenewLeaseOpen(false);
                resetRenewForm();
              }}
              isSaving={renewLease.isPending}
            />
            <form onSubmit={handleRenewLeaseSubmit} className="flex flex-col flex-1 min-h-0">
              <ModalBody className="space-y-6">
                {/* Read-only tenant/unit info */}
                <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-muted/40 p-4 text-sm">
                  <div>
                    <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tenant</span>
                    <span className="text-foreground font-semibold mt-1 block">{activeLease.tenant.fullName}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unit</span>
                    <span className="text-foreground font-semibold mt-1 block">Unit {unit?.unitNumber}</span>
                  </div>
                </div>

                {renewError && (
                  <div className="rounded bg-destructive-tint border border-destructive/30 p-2.5 text-xs text-destructive">
                    {renewError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ModalField label="New Start Date" htmlFor="renewStartDate" required>
                    <input
                      id="renewStartDate"
                      type="date"
                      required
                      value={renewStartDate}
                      onChange={(e) => handleRenewStartDateChange(e.target.value)}
                      className="block w-full h-12 rounded-lg field-focus px-4 text-foreground text-sm"
                    />
                  </ModalField>
                  <ModalField
                    label="New End Date (optional)"
                    htmlFor="renewEndDate"
                  >
                    <input
                      id="renewEndDate"
                      type="date"
                      disabled={renewNoFixedEndDate}
                      value={renewEndDate}
                      onChange={(e) => setRenewEndDate(e.target.value)}
                      className="block w-full h-12 rounded-lg field-focus px-4 text-foreground text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <Checkbox
                        id="renewNoFixedEndDate"
                        checked={renewNoFixedEndDate}
                        onCheckedChange={(checked) => handleToggleRenewNoFixedEndDate(Boolean(checked))}
                      />
                      <label
                        htmlFor="renewNoFixedEndDate"
                        className="text-xs font-medium text-foreground cursor-pointer select-none"
                      >
                        No fixed end date
                      </label>
                    </div>
                  </ModalField>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ModalField label="Rent Amount (₦)" htmlFor="renewRentAmount">
                    <input
                      id="renewRentAmount"
                      type="text"
                      inputMode="decimal"
                      value={renewRentAmount}
                      onChange={(e) => setRenewRentAmount(formatInputNumber(e.target.value))}
                      className="block w-full h-12 rounded-lg field-focus px-4 text-foreground placeholder:text-subtle-foreground text-sm"
                      placeholder="e.g. 150,000"
                    />
                  </ModalField>
                  <ModalField label="Frequency" htmlFor="renewRentFrequency">
                    <Select
                      id="renewRentFrequency"
                      value={renewRentFrequency}
                      onChange={(e) => setRenewRentFrequency(e.target.value as RentFrequency)}
                      className="h-12 text-sm"
                    >
                      {RENT_FREQUENCY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </ModalField>
                </div>

                <ModalField label="Security Deposit (₦) — optional" htmlFor="renewDepositAmount">
                  <input
                    id="renewDepositAmount"
                    type="text"
                    inputMode="decimal"
                    value={renewDepositAmount}
                    onChange={(e) => setRenewDepositAmount(formatInputNumber(e.target.value))}
                    className="block w-full h-12 rounded-lg field-focus px-4 text-foreground placeholder:text-subtle-foreground text-sm"
                    placeholder="e.g. 300,000"
                  />
                </ModalField>
              </ModalBody>

              <ModalFooter
                onCancel={() => {
                  setIsRenewLeaseOpen(false);
                  resetRenewForm();
                }}
                primaryText="Create Renewal Lease"
                isSaving={renewLease.isPending}
              />
            </form>
          </>
        )}
      </Modal>

      {/* Add Lease Modal / Invite Tenant */}
      <Modal
        open={isAddLeaseOpen}
        onOpenChange={(open) => {
          setIsAddLeaseOpen(open);
          if (!open) resetLeaseForm();
        }}
        isSaving={createLease.isPending}
        size="lg"
      >
        <ModalHeader
          title="Invite Tenant"
          onClose={() => {
            setIsAddLeaseOpen(false);
            resetLeaseForm();
          }}
          isSaving={createLease.isPending}
        />
        <form onSubmit={handleCreateLease} className="flex flex-col flex-1 min-h-0">
          <ModalBody className="space-y-6">
            {leaseError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive-tint p-3 text-sm text-destructive">
                {leaseError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ModalField label="Tenant Full Name" htmlFor="tenantName" required>
                <input
                  id="tenantName"
                  type="text"
                  required
                  aria-invalid={Boolean(tenantNameError)}
                  value={tenantName}
                  onChange={(e) => {
                    setTenantName(e.target.value);
                    if (tenantNameError) setTenantNameError(null);
                  }}
                  className="block w-full h-12 rounded-lg field-focus px-4 text-foreground placeholder:text-subtle-foreground text-sm"
                  placeholder="e.g. Sandra Okon"
                />
                {tenantNameError && (
                  <p className="mt-1 text-xs text-destructive">{tenantNameError}</p>
                )}
              </ModalField>

              <ModalField label="Tenant Email" htmlFor="tenantEmail" required>
                <input
                  id="tenantEmail"
                  type="email"
                  required
                  aria-invalid={Boolean(tenantEmailError || tenantEmailCheck?.isLandlord)}
                  value={tenantEmail}
                  onChange={(e) => {
                    setTenantEmail(e.target.value);
                    if (tenantEmailError) setTenantEmailError(null);
                  }}
                  className="block w-full h-12 rounded-lg field-focus px-4 text-foreground placeholder:text-subtle-foreground text-sm"
                  placeholder="sandra@example.com"
                />
                {tenantEmailError && (
                  <p className="mt-1 text-xs text-destructive">{tenantEmailError}</p>
                )}
                {!tenantEmailError && tenantEmailCheck?.isLandlord && (
                  <p className="mt-1 text-xs text-destructive">
                    This email belongs to a landlord account. Use the tenant&apos;s personal email.
                  </p>
                )}
                {!tenantEmailError && !tenantEmailCheck?.isLandlord && tenantEmailCheck?.isTenant && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    This person already uses PropLink. They&apos;ll get an invitation in the app.
                  </p>
                )}
              </ModalField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ModalField label="Start Date (optional)" htmlFor="startDate">
                <input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="block w-full h-12 rounded-lg field-focus px-4 text-foreground text-sm"
                />
              </ModalField>
              <ModalField label="End Date (optional)" htmlFor="endDate">
                <input
                  id="endDate"
                  type="date"
                  disabled={noFixedEndDate}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="block w-full h-12 rounded-lg field-focus px-4 text-foreground text-sm disabled:cursor-not-allowed disabled:opacity-50"
                />
                <div className="flex items-center gap-2 mt-2">
                  <Checkbox
                    id="noFixedEndDate"
                    checked={noFixedEndDate}
                    onCheckedChange={(checked) => handleToggleNoFixedEndDate(Boolean(checked))}
                  />
                  <label
                    htmlFor="noFixedEndDate"
                    className="text-xs font-medium text-foreground cursor-pointer select-none"
                  >
                    No fixed end date
                  </label>
                </div>
              </ModalField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ModalField label="Rent amount (₦)" htmlFor="rentAmount" required>
                <input
                  id="rentAmount"
                  type="text"
                  inputMode="decimal"
                  value={rentAmount}
                  onChange={(e) => {
                    setRentAmount(formatInputNumber(e.target.value));
                    if (rentAmountError) setRentAmountError(null);
                  }}
                  className="block w-full h-12 rounded-lg field-focus px-4 text-foreground placeholder:text-subtle-foreground text-sm"
                  placeholder="e.g. 150,000"
                />
                {rentAmountError && (
                  <p className="mt-1 text-xs text-destructive">{rentAmountError}</p>
                )}
              </ModalField>
              <ModalField label="Rent frequency" htmlFor="rentFrequency" required>
                <Select
                  id="rentFrequency"
                  value={rentFrequency}
                  onChange={(e) => {
                    setRentFrequency(e.target.value as RentFrequency);
                    if (rentFrequencyError) setRentFrequencyError(null);
                  }}
                  className="h-12 text-sm text-foreground"
                >
                  <option value="" disabled>Select frequency</option>
                  {RENT_FREQUENCY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
                {rentFrequencyError && (
                  <p className="mt-1 text-xs text-destructive">{rentFrequencyError}</p>
                )}
              </ModalField>
            </div>
          </ModalBody>

          <ModalFooter
            onCancel={() => {
              setIsAddLeaseOpen(false);
              resetLeaseForm();
            }}
            primaryText="Send Invite"
            isSaving={createLease.isPending}
          />
        </form>
      </Modal>

      {/* Edit Lease Modal */}
      <Modal
        open={Boolean(isEditLeaseOpen && activeLease)}
        onOpenChange={setIsEditLeaseOpen}
        isSaving={updateLease.isPending}
        size="lg"
      >
        {activeLease && (
          <>
            <ModalHeader
              title="Edit Lease Details"
              onClose={() => setIsEditLeaseOpen(false)}
              isSaving={updateLease.isPending}
            />
            <form onSubmit={handleUpdateLeaseSubmit} className="flex flex-col flex-1 min-h-0">
              <ModalBody className="space-y-6">
                {editLeaseError && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive-tint p-3 text-sm text-destructive">
                    {editLeaseError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ModalField label="Start Date" htmlFor="editStartDate" required>
                    <input
                      id="editStartDate"
                      type="date"
                      required
                      value={editStartDate}
                      onChange={(e) => handleEditStartDateChange(e.target.value)}
                      className="block w-full h-12 rounded-lg field-focus px-4 text-foreground text-sm"
                    />
                  </ModalField>
                  <ModalField label="End Date (optional)" htmlFor="editEndDate">
                    <input
                      id="editEndDate"
                      type="date"
                      disabled={editNoFixedEndDate}
                      value={editEndDate}
                      onChange={(e) => setEditEndDate(e.target.value)}
                      className="block w-full h-12 rounded-lg field-focus px-4 text-foreground text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <Checkbox
                        id="editNoFixedEndDate"
                        checked={editNoFixedEndDate}
                        onCheckedChange={(checked) => handleToggleEditNoFixedEndDate(Boolean(checked))}
                      />
                      <label
                        htmlFor="editNoFixedEndDate"
                        className="text-xs font-medium text-foreground cursor-pointer select-none"
                      >
                        No fixed end date
                      </label>
                    </div>
                  </ModalField>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ModalField label="Rent Amount (₦)" htmlFor="editRentAmount">
                    <input
                      id="editRentAmount"
                      type="text"
                      inputMode="decimal"
                      value={editRentAmount}
                      onChange={(e) => setEditRentAmount(formatInputNumber(e.target.value))}
                      className="block w-full h-12 rounded-lg field-focus px-4 text-foreground placeholder:text-subtle-foreground text-sm"
                      placeholder="e.g. 150,000"
                    />
                  </ModalField>
                  <ModalField label="Frequency" htmlFor="editRentFrequency">
                    <Select
                      id="editRentFrequency"
                      value={editRentFrequency}
                      onChange={(e) => setEditRentFrequency(e.target.value as RentFrequency)}
                      className="h-12 text-sm"
                    >
                      {RENT_FREQUENCY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </ModalField>
                </div>

                <ModalField label="Deposit Amount (₦) - Optional" htmlFor="editDepositAmount">
                  <input
                    id="editDepositAmount"
                    type="text"
                    inputMode="decimal"
                    value={editDepositAmount}
                    onChange={(e) => setEditDepositAmount(formatInputNumber(e.target.value))}
                    className="block w-full h-12 rounded-lg field-focus px-4 text-foreground placeholder:text-subtle-foreground text-sm"
                    placeholder="e.g. 50,000"
                  />
                </ModalField>
              </ModalBody>

              <ModalFooter
                onCancel={() => setIsEditLeaseOpen(false)}
                primaryText="Save Changes"
                isSaving={updateLease.isPending}
              />
            </form>
          </>
        )}
      </Modal>

      {/* Log Payment Modal */}
      <Modal
        open={Boolean(isLogPaymentOpen && activeLease)}
        onOpenChange={(open) => {
          setIsLogPaymentOpen(open);
          if (!open) resetPaymentForm();
        }}
        isSaving={createPayment.isPending}
        size="md"
      >
        {activeLease && (
          <>
            <ModalHeader
              title="Add Payment"
              onClose={() => {
                setIsLogPaymentOpen(false);
                resetPaymentForm();
              }}
              isSaving={createPayment.isPending}
            />
            <form onSubmit={handleLogPaymentSubmit} className="flex flex-col flex-1 min-h-0">
              <ModalBody className="space-y-6">
                {paymentError && (
                  <div className="rounded bg-destructive-tint border border-destructive/30 p-2.5 text-xs text-destructive">
                    {paymentError}
                  </div>
                )}

                {leases && leases.length > 1 && (
                  <ModalField label="Lease" htmlFor="paymentLease">
                    <Select
                      id="paymentLease"
                      value={selectedPaymentLeaseId || activeLease?.id || currentLease?.id || ""}
                      onChange={(e) => setSelectedPaymentLeaseId(e.target.value)}
                      className="h-12 text-sm"
                    >
                      {leases.map((l) => (
                        <option key={l.id} value={l.id}>
                          {formatDateGB(l.startDate)} – {l.endDate ? formatDateGB(l.endDate) : "Ongoing"}{l.tenant?.fullName ? ` · ${l.tenant.fullName}` : ""}{l.id === currentLease?.id ? " (Current)" : l.terminatedAt ? " (Moved out)" : " (Ended)"}
                        </option>
                      ))}
                    </Select>
                  </ModalField>
                )}

                <ModalField label="Amount (₦)" htmlFor="paymentAmount" required>
                  <input
                    id="paymentAmount"
                    type="text"
                    inputMode="decimal"
                    required
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(formatInputNumber(e.target.value))}
                    className="block w-full h-12 rounded-lg field-focus px-4 text-foreground placeholder:text-subtle-foreground text-sm"
                    placeholder="e.g. 150,000"
                  />
                  {billingSummary && billingSummary.isRentSet && (
                    <span className="text-xs text-muted-foreground block mt-1">
                      {formatCurrency(billingSummary.remainingLeaseRent)} left on this lease
                    </span>
                  )}
                </ModalField>

                <ModalField label="Payment Date" htmlFor="paymentDate" required>
                  <input
                    id="paymentDate"
                    type="date"
                    required
                    max={new Date().toISOString().split("T")[0]}
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="block w-full h-12 rounded-lg field-focus px-4 text-foreground text-sm"
                  />
                </ModalField>

                <ModalField label="Payment Method" htmlFor="paymentMethod">
                  <Select
                    id="paymentMethod"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="h-12 text-sm"
                  >
                    <option value={PaymentMethod.cash}>Cash</option>
                    <option value={PaymentMethod.bank_transfer}>Bank Transfer</option>
                    <option value={PaymentMethod.cheque}>Cheque</option>
                    <option value={PaymentMethod.other}>Other</option>
                  </Select>
                </ModalField>

                <ModalField label="Notes" htmlFor="paymentNotes">
                  <textarea
                    id="paymentNotes"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    className="block w-full min-h-[120px] rounded-lg field-focus p-4 text-foreground placeholder:text-subtle-foreground text-sm"
                    placeholder="Reference, receipt numbers or bank metadata..."
                  />
                </ModalField>
              </ModalBody>

              <ModalFooter
                onCancel={() => {
                  setIsLogPaymentOpen(false);
                  resetPaymentForm();
                }}
                primaryText="Save"
                isSaving={createPayment.isPending}
              />
            </form>
          </>
        )}
      </Modal>

      {/* Reject Payment Modal */}
      <Modal
        open={isRejectOpen}
        onOpenChange={(open) => {
          setIsRejectOpen(open);
          if (!open) {
            setRejectReason("");
            setRejectPaymentId("");
          }
        }}
        isSaving={rejectPayment.isPending}
        size="md"
      >
        <ModalHeader
          title="Dispute Tenant Payment"
          onClose={() => {
            setIsRejectOpen(false);
            setRejectReason("");
            setRejectPaymentId("");
          }}
          isSaving={rejectPayment.isPending}
        />
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
          className="flex flex-col flex-1 min-h-0"
        >
          <ModalBody className="space-y-6">
            <ModalField label="Reason for Dispute" htmlFor="rejectReason" required>
              <textarea
                id="rejectReason"
                required
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="block w-full min-h-[120px] rounded-lg field-focus p-4 text-foreground placeholder:text-subtle-foreground text-sm"
                placeholder="Specify why this payment is incorrect (e.g. money never received, wrong amount)..."
              />
            </ModalField>
          </ModalBody>

          <ModalFooter
            onCancel={() => {
              setIsRejectOpen(false);
              setRejectReason("");
              setRejectPaymentId("");
            }}
            primaryText="Submit"
            variant="destructive"
            isSaving={rejectPayment.isPending}
            disabled={!rejectReason.trim()}
          />
        </form>
      </Modal>

      {/* Landlord Payment Detail Modal */}
      <Modal
        open={Boolean(isLandlordPaymentDetailOpen && selectedLandlordPayment)}
        onOpenChange={(open) => {
          setIsLandlordPaymentDetailOpen(open);
          if (!open) setSelectedLandlordPayment(null);
        }}
        size="md"
      >
        {selectedLandlordPayment && (
          <>
            <ModalHeader
              title="Payment Details"
              onClose={() => {
                setIsLandlordPaymentDetailOpen(false);
                setSelectedLandlordPayment(null);
              }}
            />
            <ModalBody className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</span>
                  <span className="text-base font-bold text-foreground mt-1 block">{formatCurrency(selectedLandlordPayment.amount)}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</span>
                  <span className="mt-1 block">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${selectedLandlordPayment.status === "confirmed"
                      ? "bg-success-tint text-success border-success/30"
                      : selectedLandlordPayment.status === "disputed"
                        ? "bg-destructive-tint text-destructive border-destructive/30"
                        : "bg-warning-tint text-warning border-warning/30"
                      }`}>
                      {paymentStatusLabel[selectedLandlordPayment.status] ?? selectedLandlordPayment.status}
                    </span>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment Date</span>
                  <span className="text-foreground/80 mt-1 block">{new Date(selectedLandlordPayment.paymentDate).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Method</span>
                  <span className="text-foreground/80 mt-1 block capitalize">{selectedLandlordPayment.method.replace('_', ' ')}</span>
                </div>
              </div>

              <div>
                <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Period Covered</span>
                <span className="text-foreground/80 mt-1 block">
                  {new Date(selectedLandlordPayment.periodStart).toLocaleDateString()} – {new Date(selectedLandlordPayment.periodEnd).toLocaleDateString()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Logged By</span>
                  <span className="text-foreground/80 mt-1 block capitalize">
                    {selectedLandlordPayment.recorder?.fullName || "System"} ({selectedLandlordPayment.recordedByRole})
                  </span>
                </div>
                {selectedLandlordPayment.confirmedAt && (
                  <div>
                    <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Confirmed At</span>
                    <span className="text-foreground/80 mt-1 block">{new Date(selectedLandlordPayment.confirmedAt).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              {selectedLandlordPayment.notes && (
                <div>
                  <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</span>
                  <p className="text-foreground/80 mt-1 bg-muted p-2.5 rounded-lg border border-border text-xs">{selectedLandlordPayment.notes}</p>
                </div>
              )}

              {selectedLandlordPayment.disputeReason && (
                <div>
                  <span className="block text-xs font-semibold text-destructive uppercase tracking-wider">Rejection Reason</span>
                  <p className="text-destructive mt-1 bg-destructive-tint p-2.5 rounded-lg border border-destructive/20 text-xs">{selectedLandlordPayment.disputeReason}</p>
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
                  <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Proof Document</span>
                  <div className="mt-2 flex flex-col items-start gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleViewPaymentProof(selectedLandlordPayment.proofUrl!)}
                      className="inline-flex items-center text-xs text-foreground hover:underline bg-card border border-border px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-accent"
                    >
                      View / Download Proof
                    </button>
                    {selectedLandlordPayment.status === "pending" ? (
                      <button
                        type="button"
                        onClick={() => setIsDeletePaymentProofConfirmOpen(true)}
                        className="text-xs text-destructive hover:underline transition-colors mt-0.5"
                      >
                        Remove proof
                      </button>
                    ) : (
                      <p className="text-xs text-muted-foreground italic mt-0.5">
                        Proof is locked because this payment is confirmed.
                      </p>
                    )}
                  </div>
                </div>
              ) : selectedLandlordPayment.status === "pending" ? (
                <div>
                  <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Proof Document</span>
                  <div className="mt-2">
                    <label className="block">
                      <span className="sr-only">Upload proof document</span>
                      <input
                        type="file"
                        accept=".pdf, image/*"
                        onChange={handleLandlordProofUpload}
                        disabled={uploadingPaymentProof}
                        className="block w-full text-xs text-muted-foreground file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer disabled:opacity-50"
                      />
                    </label>
                    {uploadingPaymentProof && <p className="text-xs text-muted-foreground mt-1 animate-pulse">Uploading file...</p>}
                  </div>
                </div>
              ) : null}
            </ModalBody>

            <div className="pt-4 border-t border-border space-y-3">
              {/* Inline Confirm/Reject — shown only for pending payments */}
              {selectedLandlordPayment.status === 'pending' && (
                <div className="grid grid-cols-2 gap-4">
                  <Button
                    onClick={() => {
                      setRejectPaymentId(selectedLandlordPayment.id);
                      setRejectReason('');
                      setIsLandlordPaymentDetailOpen(false);
                      setIsRejectOpen(true);
                    }}
                    disabled={confirmPayment.isPending || rejectPayment.isPending}
                    variant="outline"
                    className="w-full border-border text-destructive hover:bg-destructive-tint hover:border-destructive/30 font-semibold h-12 text-sm rounded-lg"
                  >
                    Reject
                  </Button>
                  <Button
                    onClick={() => confirmPayment.mutate({ paymentId: selectedLandlordPayment.id })}
                    disabled={confirmPayment.isPending || rejectPayment.isPending}
                    className="w-full bg-success hover:bg-success/90 text-success-foreground font-semibold h-12 text-sm rounded-lg"
                  >
                    {confirmPayment.isPending ? 'Confirming…' : 'Confirm Payment'}
                  </Button>
                </div>
              )}
              <Button
                onClick={() => { setIsLandlordPaymentDetailOpen(false); setSelectedLandlordPayment(null); }}
                className="w-full bg-card border border-border hover:bg-accent text-foreground font-semibold h-12 rounded-lg"
              >
                Close
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* Edit/Resolve Dispute Modal */}
      <Modal
        open={isEditOpen}
        onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) resetEditForm();
        }}
        isSaving={resolvePayment.isPending}
        size="md"
      >
        <ModalHeader
          title="Resolve Payment Dispute"
          onClose={() => {
            setIsEditOpen(false);
            resetEditForm();
          }}
          isSaving={resolvePayment.isPending}
        />
        <form onSubmit={handleEditPaymentSubmit} className="flex flex-col flex-1 min-h-0">
          <ModalBody className="space-y-6">
            <ModalField label="Resolution Action" htmlFor="editAction">
              <Select
                id="editAction"
                value={editAction}
                onChange={(e) => setEditAction(e.target.value as "edit" | "void")}
                className="h-12 text-sm"
              >
                <option value="edit">Correct Details & Keep Confirmed</option>
                <option value="void">Void Payment Entirely</option>
              </Select>
            </ModalField>

            {editAction === "edit" ? (
              <>
                <ModalField label="Corrected Amount (₦)" htmlFor="editAmount" required>
                  <input
                    id="editAmount"
                    type="text"
                    inputMode="decimal"
                    required
                    value={editAmount}
                    onChange={(e) => setEditAmount(formatInputNumber(e.target.value))}
                    className="block w-full h-12 rounded-lg field-focus px-4 text-foreground text-sm"
                  />
                </ModalField>
                <ModalField label="Corrected Date" htmlFor="editPaymentDate" required>
                  <input
                    id="editPaymentDate"
                    type="date"
                    required
                    value={editPaymentDate}
                    onChange={(e) => setEditPaymentDate(e.target.value)}
                    className="block w-full h-12 rounded-lg field-focus px-4 text-foreground text-sm"
                  />
                </ModalField>
                <ModalField label="Corrected Method" htmlFor="editMethod">
                  <Select
                    id="editMethod"
                    value={editMethod}
                    onChange={(e) => setEditMethod(e.target.value as PaymentMethod)}
                    className="h-12 text-sm"
                  >
                    <option value={PaymentMethod.cash}>Cash</option>
                    <option value={PaymentMethod.bank_transfer}>Bank Transfer</option>
                    <option value={PaymentMethod.cheque}>Cheque</option>
                    <option value={PaymentMethod.other}>Other</option>
                  </Select>
                </ModalField>
              </>
            ) : (
              <p className="text-xs text-muted-foreground bg-destructive-tint border border-destructive/30 p-2.5 rounded">
                ⚠️ Voiding this payment marks it as disputed and removes it from outstanding balance calculations.
              </p>
            )}
          </ModalBody>

          <ModalFooter
            onCancel={() => {
              setIsEditOpen(false);
              resetEditForm();
            }}
            primaryText="Apply Resolution"
            isSaving={resolvePayment.isPending}
          />
        </form>
      </Modal>

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
        loadingText="Removing..."
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
        loadingText="Voiding..."
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

      {/* Cancel Invitation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(cancelInvitationConfirmId)}
        onClose={() => setCancelInvitationConfirmId(null)}
        onConfirm={async () => {
          if (!cancelInvitationConfirmId) return;
          try {
            await cancelInvitation.mutateAsync({ leaseId: cancelInvitationConfirmId });
          } catch {
            // handled
          }
        }}
        title="Cancel invitation?"
        description="Are you sure you want to cancel this invitation? The unit will return to vacant."
        confirmText="Cancel invitation"
        cancelText="Keep invitation"
        loadingText="Cancelling..."
        variant="danger"
        isLoading={cancelInvitation.isPending}
      />

      {/* Cancel Code Invite Dialog */}
      <ConfirmDialog
        isOpen={isCancelCodeInviteOpen}
        onClose={() => setIsCancelCodeInviteOpen(false)}
        onConfirm={async () => {
          if (!activeLease) return;
          try {
            await cancelCodeInviteMutation.mutateAsync({ leaseId: activeLease.id });
          } catch {
            // handled
          }
        }}
        title="Cancel invite?"
        description={`${activeLease?.tenant?.fullName ? `${activeLease.tenant.fullName}'s` : "The"} invite code stops working and ${unit?.unitNumber ? `Unit ${unit.unitNumber}` : "this unit"} becomes vacant.`}
        confirmText="Cancel invite"
        cancelText="Keep invite"
        loadingText="Cancelling..."
        variant="danger"
        isLoading={cancelCodeInviteMutation.isPending}
      />

      {/* Edit Placeholder Tenant Modal */}
      <Modal
        open={Boolean(isEditTenantOpen && activeLease)}
        onOpenChange={(open) => {
          setIsEditTenantOpen(open);
          if (!open) setEditTenantError(null);
        }}
        isSaving={updatePlaceholderTenantMutation.isPending}
        size="md"
      >
        {activeLease && (
          <>
            <ModalHeader
              title="Edit Tenant Details"
              onClose={() => {
                setIsEditTenantOpen(false);
                setEditTenantError(null);
              }}
              isSaving={updatePlaceholderTenantMutation.isPending}
            />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = editTenantFullName.trim();
                const email = editTenantEmail.trim();
                if (!name) {
                  setEditTenantError("Enter the tenant's full name");
                  return;
                }
                if (!email) {
                  setEditTenantError("Enter the tenant's email address");
                  return;
                }
                setEditTenantError(null);
                updatePlaceholderTenantMutation.mutate({
                  leaseId: activeLease.id,
                  fullName: name,
                  email: email,
                });
              }}
              className="flex flex-col flex-1 min-h-0"
            >
              <ModalBody className="space-y-6">
                {editTenantError && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive-tint p-3 text-sm text-destructive">
                    {editTenantError}
                  </div>
                )}

                <ModalField label="Full Name" htmlFor="editTenantFullName" required>
                  <input
                    id="editTenantFullName"
                    type="text"
                    required
                    value={editTenantFullName}
                    onChange={(e) => {
                      setEditTenantFullName(e.target.value);
                      if (editTenantError) setEditTenantError(null);
                    }}
                    className="block w-full h-12 rounded-lg field-focus px-4 text-foreground placeholder:text-subtle-foreground text-sm"
                    placeholder="e.g. John Doe"
                  />
                </ModalField>

                <ModalField label="Email" htmlFor="editTenantEmail" required>
                  <input
                    id="editTenantEmail"
                    type="email"
                    required
                    value={editTenantEmail}
                    onChange={(e) => {
                      setEditTenantEmail(e.target.value);
                      if (editTenantError) setEditTenantError(null);
                    }}
                    className="block w-full h-12 rounded-lg field-focus px-4 text-foreground placeholder:text-subtle-foreground text-sm"
                    placeholder="e.g. john@example.com"
                  />
                </ModalField>
              </ModalBody>

              <ModalFooter
                onCancel={() => {
                  setIsEditTenantOpen(false);
                  setEditTenantError(null);
                }}
                primaryText="Save"
                isSaving={updatePlaceholderTenantMutation.isPending}
              />
            </form>
          </>
        )}
      </Modal>

      {/* Confirm Mark as Moved Out Dialog */}
      <ConfirmDialog
        isOpen={isMovedOutConfirmOpen}
        onClose={() => setIsMovedOutConfirmOpen(false)}
        onConfirm={() => {
          if (activeLease) {
            markMovedOutMutation.mutate({ leaseId: activeLease.id });
          }
        }}
        title="Mark as moved out?"
        description={
          billingSummary && billingSummary.outstanding > 0
            ? `${activeLease?.tenant?.fullName ? `${activeLease.tenant.fullName}` : "The tenant"} will be marked as moved out of Unit ${unit.unitNumber}. The unit becomes vacant. This lease and its payments stay in the history.\n\n${formatCurrency(billingSummary.outstanding)} is still unpaid. It stays on record.`
            : `${activeLease?.tenant?.fullName ? `${activeLease.tenant.fullName}` : "The tenant"} will be marked as moved out of Unit ${unit.unitNumber}. The unit becomes vacant. This lease and its payments stay in the history.`
        }
        confirmText="Mark as moved out"
        loadingText="Marking as moved out..."
        cancelText="Cancel"
        isLoading={markMovedOutMutation.isPending}
      />
    </div>
  );
}
