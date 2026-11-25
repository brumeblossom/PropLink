'use client';

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { DetailActionRow } from "@/components/layout/DetailActionRow";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalField, ModalSegmentedControl } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { PropertyType } from "@prisma/client";
import { NIGERIA_STATES, NIGERIA_LGAS } from "@/utils/nigeriaGeo";
import { X, Trash2, ChevronDown, Plus, Pencil, Search } from "lucide-react";
import { getUnitTypesByPropertyType, isResidentialUnitType } from "@/lib/unit-types";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function PropertyDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const propertyId = params.id as string;
  const utils = trpc.useUtils();

  const bulkAddParam = searchParams.get("bulkAdd");

  // Queries
  const { data: property, isLoading: isLoadingProperty } = trpc.properties.getById.useQuery({ id: propertyId });
  const { data: units, isLoading: isLoadingUnits } = trpc.units.listByProperty.useQuery({ propertyId });

  const { toast } = useToast();
  const [isDeletePropertyConfirmOpen, setIsDeletePropertyConfirmOpen] = useState(false);
  const [unitToDelete, setUnitToDelete] = useState<{ id: string; unitNumber: string } | null>(null);

  // Selection state
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);

  // Search & Filters state (synced with URL)
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [typeFilter, setTypeFilter] = useState(searchParams.get("type") || "all");

  const updateFilters = (newQ: string, newStatus: string, newType: string) => {
    setSelectedUnitIds([]);
    setSearchQuery(newQ);
    setStatusFilter(newStatus);
    setTypeFilter(newType);

    const currentUrlParams = new URLSearchParams(window.location.search);
    if (newQ.trim()) currentUrlParams.set("q", newQ.trim());
    else currentUrlParams.delete("q");

    if (newStatus && newStatus !== "all") currentUrlParams.set("status", newStatus);
    else currentUrlParams.delete("status");

    if (newType && newType !== "all") currentUrlParams.set("type", newType);
    else currentUrlParams.delete("type");

    const queryStr = currentUrlParams.toString();
    const newUrl = queryStr ? `${window.location.pathname}?${queryStr}` : window.location.pathname;
    window.history.replaceState({}, "", newUrl);
  };

  const clearFilters = () => {
    updateFilters("", "all", "all");
  };

  const isFiltering = Boolean(searchQuery.trim()) || statusFilter !== "all" || typeFilter !== "all";

  // Mutations
  const updateProperty = trpc.properties.update.useMutation({
    onSuccess: () => {
      utils.properties.list.invalidate();
      utils.properties.getById.invalidate({ id: propertyId });
      setIsEditPropertyOpen(false);
      toast("Property updated", "success");
    },
    onError: (err) => {
      setDeleteError(err.message || "Failed to update property.");
    },
  });

  const deleteProperty = trpc.properties.delete.useMutation({
    onSuccess: () => {
      utils.properties.list.invalidate();
      utils.properties.getById.invalidate({ id: propertyId });
      toast("Property deleted", "success");
      router.push("/landlord/properties");
    },
    onError: (err) => {
      setDeleteError(err.message);
    },
  });

  const createUnit = trpc.units.create.useMutation({
    onSuccess: () => {
      utils.units.listByProperty.invalidate({ propertyId });
      utils.properties.list.invalidate();
      utils.properties.getById.invalidate({ id: propertyId });
      setIsAddUnitOpen(false);
      resetUnitForm();
      toast("Unit created", "success");
    },
    onError: (err) => {
      setUnitError(err.message);
    },
  });

  const createBulkUnits = trpc.units.createBulk.useMutation({
    onSuccess: () => {
      utils.units.listByProperty.invalidate({ propertyId });
      utils.properties.list.invalidate();
      utils.properties.getById.invalidate({ id: propertyId });
      setIsBulkAddOpen(false);
      resetBulkForm();
      toast("Units created successfully", "success");
    },
    onError: (err) => {
      setBulkError(err.message);
    },
  });

  const updateUnit = trpc.units.update.useMutation({
    onSuccess: () => {
      utils.units.listByProperty.invalidate({ propertyId });
      utils.properties.list.invalidate();
      utils.properties.getById.invalidate({ id: propertyId });
      setIsEditUnitOpen(false);
      resetEditUnitForm();
      toast("Unit updated", "success");
    },
    onError: (err) => {
      setEditUnitError(err.message);
    },
  });

  const deleteUnit = trpc.units.delete.useMutation({
    onSuccess: () => {
      utils.units.listByProperty.invalidate({ propertyId });
      utils.properties.list.invalidate();
      utils.properties.getById.invalidate({ id: propertyId });
      toast("Unit deleted", "success");
      setUnitToDelete(null);
    },
    onError: (err) => {
      setDeleteError(err.message);
    },
  });

  const bulkDeleteUnits = trpc.units.bulkDelete.useMutation({
    onSuccess: (data) => {
      utils.units.listByProperty.invalidate({ propertyId });
      utils.properties.list.invalidate();
      utils.properties.getById.invalidate({ id: propertyId });
      toast(`${data.count} ${data.count === 1 ? "unit" : "units"} deleted`, "success");
      setSelectedUnitIds([]);
      setIsBulkDeleteConfirmOpen(false);
    },
    onError: (err) => {
      setDeleteError(err.message);
      setIsBulkDeleteConfirmOpen(false);
    },
  });

  // State
  const [isEditPropertyOpen, setIsEditPropertyOpen] = useState(false);
  const [isAddUnitOpen, setIsAddUnitOpen] = useState(false);
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
  const [isAddDropdownOpen, setIsAddDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsAddDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const [isEditUnitOpen, setIsEditUnitOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Form states for Property
  const [propertyName, setPropertyName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [propertyCity, setPropertyCity] = useState("");
  const [propertyState, setPropertyState] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>(PropertyType.residential);
  const [expectedUnits, setExpectedUnits] = useState("");

  // Form states for Unit
  const availableTypes = property ? getUnitTypesByPropertyType(property.propertyType) : [];
  const defaultUnitType = availableTypes[0] || "flat";
  const [unitNumber, setUnitNumber] = useState("");
  const [unitType, setUnitType] = useState(defaultUnitType);
  const [roomsCount, setRoomsCount] = useState("");
  const [sizeSqm, setSizeSqm] = useState("");
  const [unitError, setUnitError] = useState<string | null>(null);

  // Form states for Edit Unit
  const [editUnitId, setEditUnitId] = useState("");
  const [editUnitNumber, setEditUnitNumber] = useState("");
  const [editUnitType, setEditUnitType] = useState("");
  const [editRoomsCount, setEditRoomsCount] = useState("");
  const [editUnitError, setEditUnitError] = useState<string | null>(null);

  // Form states for Bulk Add
  const [bulkMode, setBulkMode] = useState<"range" | "manual">("range");
  const [rangePrefix, setRangePrefix] = useState("Flat");
  const [rangeStart, setRangeStart] = useState("1");
  const [rangeEnd, setRangeEnd] = useState("10");
  const [rangeType, setRangeType] = useState(defaultUnitType);
  const [rangeRoomsCount, setRangeRoomsCount] = useState("");
  const [manualRows, setManualRows] = useState<Array<{ unitNumber: string; unitType: string; roomsCount: string }>>([
    { unitNumber: "", unitType: defaultUnitType, roomsCount: "" },
    { unitNumber: "", unitType: defaultUnitType, roomsCount: "" },
    { unitNumber: "", unitType: defaultUnitType, roomsCount: "" },
  ]);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const resetBulkForm = () => {
    setBulkMode("range");
    setRangePrefix("Flat");
    setRangeStart("1");
    setRangeEnd("10");
    setRangeType(defaultUnitType);
    setRangeRoomsCount("");
    setManualRows([
      { unitNumber: "", unitType: defaultUnitType, roomsCount: "" },
      { unitNumber: "", unitType: defaultUnitType, roomsCount: "" },
      { unitNumber: "", unitType: defaultUnitType, roomsCount: "" },
    ]);
  };

  useEffect(() => {
    if (bulkAddParam === "true") {
      setIsBulkAddOpen(true);
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }
  }, [bulkAddParam]);

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkError(null);

    let unitsToCreate: Array<{ unitNumber: string; unitType: string; roomsCount?: number | null }> = [];

    if (bulkMode === "range") {
      const start = parseInt(rangeStart, 10);
      const end = parseInt(rangeEnd, 10);

      if (isNaN(start) || isNaN(end)) {
        setBulkError("Start and End must be valid numbers.");
        return;
      }

      if (start <= 0 || end <= 0) {
        setBulkError("Start and End must be positive integers.");
        return;
      }

      if (start > end) {
        setBulkError("Start number must be less than or equal to End number.");
        return;
      }

      const totalCount = end - start + 1;
      if (totalCount > 100) {
        setBulkError("Range exceeds maximum limit of 100 units at once.");
        return;
      }

      const isResidential = isResidentialUnitType(rangeType);
      const parsedRooms = isResidential && rangeRoomsCount ? parseInt(rangeRoomsCount, 10) : null;

      const trimmedPrefix = rangePrefix.trim();
      for (let i = start; i <= end; i++) {
        unitsToCreate.push({
          unitNumber: trimmedPrefix ? `${trimmedPrefix} ${i}` : `${i}`,
          unitType: rangeType,
          roomsCount: parsedRooms,
        });
      }
    } else {
      const validRows = manualRows.filter((r) => r.unitNumber.trim() !== "");
      if (validRows.length === 0) {
        setBulkError("Please enter at least one unit number.");
        return;
      }

      const unitNumbers = validRows.map((r) => r.unitNumber.trim());
      const uniqueUnitNumbers = new Set(unitNumbers);
      if (uniqueUnitNumbers.size !== unitNumbers.length) {
        setBulkError("Duplicate unit numbers are not allowed in your manual list.");
        return;
      }

      unitsToCreate = validRows.map((r) => {
        const isResidential = isResidentialUnitType(r.unitType);
        return {
          unitNumber: r.unitNumber.trim(),
          unitType: r.unitType,
          roomsCount: isResidential && r.roomsCount ? parseInt(r.roomsCount, 10) : null,
        };
      });
    }

    try {
      await createBulkUnits.mutateAsync({
        propertyId,
        units: unitsToCreate,
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenEdit = () => {
    if (property) {
      setPropertyName(property.name);
      setPropertyAddress(property.address);
      setPropertyCity(property.city);
      setPropertyState(property.state);
      setPropertyType(property.propertyType);
      setExpectedUnits(property.expectedUnits ? property.expectedUnits.toString() : "");
      setIsEditPropertyOpen(true);
    }
  };

  const handleUpdateProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProperty.mutateAsync({
        id: propertyId,
        name: propertyName,
        address: propertyAddress,
        city: propertyCity,
        state: propertyState,
        propertyType,
        expectedUnits: expectedUnits ? parseInt(expectedUnits, 10) : null,
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteProperty = async () => {
    setDeleteError(null);
    try {
      await deleteProperty.mutateAsync({ id: propertyId });
      setIsDeletePropertyConfirmOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const resetUnitForm = () => {
    setUnitNumber("");
    setUnitType(defaultUnitType);
    setRoomsCount("");
    setSizeSqm("");
    setUnitError(null);
  };

  const resetEditUnitForm = () => {
    setEditUnitId("");
    setEditUnitNumber("");
    setEditUnitType("");
    setEditRoomsCount("");
    setEditUnitError(null);
  };

  const handleOpenEditUnit = (unit: {
    id: string;
    unitNumber: string;
    unitType: string;
    roomsCount?: number | null;
  }) => {
    setEditUnitId(unit.id);
    setEditUnitNumber(unit.unitNumber);
    setEditUnitType(unit.unitType);
    setEditRoomsCount(unit.roomsCount ? unit.roomsCount.toString() : "");
    setEditUnitError(null);
    setIsEditUnitOpen(true);
  };

  const handleUpdateUnitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditUnitError(null);
    try {
      await updateUnit.mutateAsync({
        id: editUnitId,
        unitNumber: editUnitNumber,
        unitType: editUnitType,
        roomsCount: isResidentialUnitType(editUnitType) && editRoomsCount ? parseInt(editRoomsCount, 10) : null,
      });
    } catch {
      // handled
    }
  };

  const handleDeleteUnit = async () => {
    if (!unitToDelete) return;
    setDeleteError(null);
    try {
      await deleteUnit.mutateAsync({ id: unitToDelete.id });
    } catch {
      // handled
    }
  };

  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnitError(null);

    const parsedSize = sizeSqm ? parseFloat(sizeSqm) : undefined;
    if (sizeSqm && (isNaN(parsedSize!) || parsedSize! <= 0)) {
      setUnitError("Size must be a positive number.");
      return;
    }

    try {
      await createUnit.mutateAsync({
        propertyId,
        unitNumber,
        unitType,
        roomsCount: isResidentialUnitType(unitType) && roomsCount ? parseInt(roomsCount, 10) : null,
        sizeSqm: parsedSize,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create unit.";
      setUnitError(message);
    }
  };

  // Filtered units computation
  const availableUnitTypes = Array.from(new Set((units ?? []).map((u) => u.unitType))).filter(Boolean);

  const filteredUnits = (units ?? []).filter((unit) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const unitMatch = unit.unitNumber.toLowerCase().includes(q);
      const tenantMatch = unit.activeLease?.tenantName?.toLowerCase().includes(q) ?? false;
      if (!unitMatch && !tenantMatch) return false;
    }
    if (statusFilter !== "all" && unit.status !== statusFilter) {
      return false;
    }
    if (typeFilter !== "all" && unit.unitType !== typeFilter) {
      return false;
    }
    return true;
  });

  const deletableUnits = filteredUnits.filter(
    (u) => u.status !== "occupied" && u.status !== "reserved"
  );
  const deletableUnitIds = deletableUnits.map((u) => u.id);

  const isAllDeletableSelected =
    deletableUnitIds.length > 0 &&
    deletableUnitIds.every((id) => selectedUnitIds.includes(id));
  const isSomeDeletableSelected =
    deletableUnitIds.some((id) => selectedUnitIds.includes(id)) &&
    !isAllDeletableSelected;

  const handleSelectAllToggle = () => {
    if (isAllDeletableSelected) {
      setSelectedUnitIds((prev) =>
        prev.filter((id) => !deletableUnitIds.includes(id))
      );
    } else {
      setSelectedUnitIds((prev) =>
        Array.from(new Set([...prev, ...deletableUnitIds]))
      );
    }
  };

  const handleSelectRow = (unitId: string) => {
    setSelectedUnitIds((prev) =>
      prev.includes(unitId) ? prev.filter((id) => id !== unitId) : [...prev, unitId]
    );
  };

  const handleClearSelection = () => {
    setSelectedUnitIds([]);
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedUnitIds.length === 0) return;
    setDeleteError(null);
    try {
      await bulkDeleteUnits.mutateAsync({ ids: selectedUnitIds });
    } catch {
      // handled in mutation onError
    }
  };

  const selectedUnitsList = (units ?? []).filter((u) => selectedUnitIds.includes(u.id));
  const selectedUnitsText = (() => {
    const names = selectedUnitsList.map((u) => u.unitNumber);
    if (names.length === 0) return "";
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  })();

  if (isLoadingProperty || isLoadingUnits) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <PageHeader title={<Skeleton className="h-6 w-36" />} />

        {/* Main Container */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12 space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32" />
            <div className="flex space-x-2">
              <Skeleton className="h-9 w-24 rounded-md" />
              <Skeleton className="h-9 w-24 rounded-md" />
            </div>
          </div>

          {/* Property Overview Card */}
          <div className="rounded-xl border border-border bg-card p-6 backdrop-blur-sm space-y-3">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>

          {/* Units Section */}
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-9 w-28 rounded-md" />
            </div>
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </main>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
        <p className="text-lg">Property not found.</p>
        <Link href="/landlord/properties" className="text-sm underline mt-2">
          Back to properties
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sticky header shows only property title and notification bell */}
      <PageHeader title={property.name} />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12 space-y-6">
        {/* Detail Action Row */}
        <DetailActionRow
          backHref="/landlord/properties"
          backLabel="Back to Properties"
          actions={[
            {
              label: "Edit property",
              onClick: handleOpenEdit,
              icon: <Pencil className="w-4 h-4" />,
              variant: "outline",
            },
            {
              label: "Delete property",
              onClick: () => setIsDeletePropertyConfirmOpen(true),
              icon: <Trash2 className="w-4 h-4" />,
              variant: "danger",
            },
          ]}
        />

        {deleteError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive-tint p-4 text-sm text-destructive">
            {deleteError}
          </div>
        )}

        {/* Property Info Header card (Total Units removed) */}
        <div className="rounded-xl border border-border bg-card p-6 backdrop-blur-sm">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-foreground/80 capitalize inline-block">
            {property.propertyType}
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight mt-2">{property.name}</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {property.address}, {property.city}, {property.state}
          </p>
        </div>

        {/* Units Section */}
        <div className="pt-2">
          {/* Section heading + Add Unit button */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight">All Units</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
                {units?.length || 0}
              </span>
              <Link
                href={`/landlord/tenants?propertyId=${propertyId}&status=all`}
                className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted hover:bg-accent text-foreground/80 hover:text-foreground transition-colors border border-border inline-flex items-center gap-1"
              >
                <span>{property.tenantsSoFarCount ?? 0} tenants so far</span>
              </Link>
            </div>

            {/* Unified Add Unit dropdown */}
            <div className="relative" ref={dropdownRef}>
              <Button
                onClick={() => setIsAddDropdownOpen(!isAddDropdownOpen)}
                size="action"
                className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring"
                aria-expanded={isAddDropdownOpen}
                aria-haspopup="menu"
              >
                <Plus className="w-4 h-4" />
                <span>Add unit</span>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 transition-transform duration-200",
                    isAddDropdownOpen && "transform rotate-180"
                  )}
                />
              </Button>
              {isAddDropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-48 rounded-xl border border-border bg-card p-1.5 shadow-2xl z-50 animate-in fade-in duration-100"
                  role="menu"
                >
                  <button
                    onClick={() => {
                      setIsAddDropdownOpen(false);
                      setIsAddUnitOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-foreground/80 hover:text-foreground hover:bg-accent transition-colors focus:outline-none focus:bg-accent"
                    role="menuitem"
                  >
                    Add Single Unit
                  </button>
                  <button
                    onClick={() => {
                      setIsAddDropdownOpen(false);
                      setIsBulkAddOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-foreground/80 hover:text-foreground hover:bg-accent transition-colors focus:outline-none focus:bg-accent"
                    role="menuitem"
                  >
                    Add Bulk Units
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Search and Filters Toolbar / Selection Bar */}
          {units && units.length > 0 && (
            selectedUnitIds.length > 0 ? (
              /* Desktop: replaces search/filter toolbar at same height (h-9 or matching container) */
              <div className="hidden md:flex items-center justify-between h-9 px-3 rounded-lg border border-border bg-card mb-4 animate-in fade-in duration-150">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-foreground">
                    {selectedUnitIds.length} selected
                  </span>
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <Button
                  type="button"
                  onClick={() => setIsBulkDeleteConfirmOpen(true)}
                  className="h-7 px-2.5 text-xs font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </Button>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                <div className="flex flex-col md:flex-row md:items-center gap-2.5 flex-1">
                  {/* Search Input */}
                  <div className="relative w-full md:w-[280px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle-foreground" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => updateFilters(e.target.value, statusFilter, typeFilter)}
                      placeholder="Search unit or tenant"
                      className="w-full rounded-lg border border-input bg-card pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring h-9"
                    />
                  </div>

                  {/* Filter Dropdowns */}
                  <div className="grid grid-cols-2 md:flex md:items-center gap-2 w-full md:w-auto">
                    <Select
                      value={statusFilter}
                      onChange={(e) => updateFilters(searchQuery, e.target.value, typeFilter)}
                      className="h-9 text-xs"
                    >
                      <option value="all">All statuses</option>
                      <option value="occupied">Occupied</option>
                      <option value="reserved">Reserved</option>
                      <option value="vacant">Vacant</option>
                    </Select>

                    <Select
                      value={typeFilter}
                      onChange={(e) => updateFilters(searchQuery, statusFilter, e.target.value)}
                      className="h-9 text-xs capitalize"
                    >
                      <option value="all">All types</option>
                      {availableUnitTypes.map((t) => (
                        <option key={t} value={t} className="capitalize">
                          {t}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {/* Clear button if filtering */}
                  {isFiltering && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-xs text-muted-foreground hover:text-foreground underline py-1 px-1 transition-colors self-start md:self-auto"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Filtered count on right: only when filtering */}
                {isFiltering && (
                  <span className="text-xs text-subtle-foreground font-medium whitespace-nowrap self-end md:self-auto">
                    {filteredUnits.length} of {units.length} units
                  </span>
                )}
              </div>
            )
          )}

          {/* Units View */}
          {units && units.length > 0 ? (
            filteredUnits.length > 0 ? (
              <>
                {/* Desktop Table: Checkbox (44px) | Unit Name/Number | Unit Type | Current Tenant | Lease Range | Status | Actions */}
                <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-card backdrop-blur-sm">
                  <table className="w-full min-w-[800px] divide-y divide-border">
                    <thead className="bg-muted">
                      <tr>
                        <th
                          scope="col"
                          className="w-[44px] min-w-[44px] max-w-[44px] px-3.5 py-3.5 text-center"
                        >
                          <div className="flex items-center justify-center">
                            <Checkbox
                              checked={
                                isAllDeletableSelected
                                  ? true
                                  : isSomeDeletableSelected
                                    ? "indeterminate"
                                    : false
                              }
                              onCheckedChange={handleSelectAllToggle}
                              disabled={deletableUnitIds.length === 0}
                              aria-label="Select all deletable units on this page"
                            />
                          </div>
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                        >
                          Unit Name/Number
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                        >
                          Unit Type
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                        >
                          Current Tenant
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                        >
                          Lease Range
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                        >
                          Status
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 bg-transparent">
                      {filteredUnits.map((unit) => {
                        const isOccupiedOrReserved = unit.status === "occupied" || unit.status === "reserved";
                        const isSelected = selectedUnitIds.includes(unit.id);

                        return (
                          <tr
                            key={unit.id}
                            className={cn(
                              "transition-colors cursor-pointer",
                              isSelected
                                ? "bg-muted hover:bg-muted/80"
                                : "hover:bg-accent"
                            )}
                            onClick={() => router.push(`/landlord/properties/${propertyId}/units/${unit.id}`)}
                          >
                            <td
                              className="w-[44px] min-w-[44px] max-w-[44px] px-3.5 py-4 text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-center">
                                {isOccupiedOrReserved ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex cursor-not-allowed">
                                        <Checkbox
                                          disabled
                                          checked={false}
                                          aria-label={`Unit ${unit.unitNumber} has a tenant and cannot be selected`}
                                        />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" align="center">
                                      This unit has a tenant
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => handleSelectRow(unit.id)}
                                    aria-label={`Select unit ${unit.unitNumber}`}
                                  />
                                )}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-foreground">
                              {unit.unitNumber}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-foreground/80 capitalize">
                              {unit.unitType}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-foreground/80">
                              {unit.activeLease?.tenantName || (
                                <span className="text-subtle-foreground">Vacant</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                              {unit.activeLease
                                ? `${new Date(unit.activeLease.startDate).toLocaleDateString()} - ${unit.activeLease.endDate ? new Date(unit.activeLease.endDate).toLocaleDateString() : "Ongoing"}`
                                : "—"}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm">
                              <span
                                className={cn(
                                  "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize",
                                  unit.status === "occupied"
                                    ? "bg-success-tint text-success border border-success/20"
                                    : unit.status === "reserved"
                                      ? "bg-primary-tint text-primary border border-primary/20"
                                      : "bg-warning-tint text-warning border border-warning/20"
                                )}
                              >
                                {unit.status}
                              </span>
                            </td>
                            <td
                              className="whitespace-nowrap px-6 py-4 text-sm text-right font-medium"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex justify-end space-x-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditUnit(unit)}
                                  title="Edit unit"
                                  aria-label="Edit unit"
                                  className="p-1.5 text-muted-foreground hover:text-foreground bg-card border border-border hover:border-border/80 rounded-lg transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setUnitToDelete({ id: unit.id, unitNumber: unit.unitNumber })}
                                  title="Delete unit"
                                  aria-label="Delete unit"
                                  className="p-1.5 text-destructive hover:text-destructive/80 bg-card border border-border hover:border-border/80 rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Stacked Cards (< 768px) */}
                <div className="md:hidden space-y-3">
                  {filteredUnits.map((unit) => {
                    const isOccupiedOrReserved = unit.status === "occupied" || unit.status === "reserved";
                    const isSelected = selectedUnitIds.includes(unit.id);

                    return (
                      <div
                        key={unit.id}
                        onClick={() => router.push(`/landlord/properties/${propertyId}/units/${unit.id}`)}
                        className={cn(
                          "rounded-xl border p-4 space-y-3 cursor-pointer transition-colors flex items-start gap-3",
                          isSelected
                            ? "bg-muted border-border hover:bg-muted/80"
                            : "border-border bg-card hover:bg-accent hover:border-border/80"
                        )}
                      >
                        {/* Checkbox on left of unit card */}
                        <div
                          className="pt-0.5 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isOccupiedOrReserved ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex cursor-not-allowed">
                                  <Checkbox
                                    disabled
                                    checked={false}
                                    aria-label={`Unit ${unit.unitNumber} has a tenant and cannot be selected`}
                                  />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="right" align="center">
                                This unit has a tenant
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleSelectRow(unit.id)}
                              aria-label={`Select unit ${unit.unitNumber}`}
                            />
                          )}
                        </div>

                        {/* Card body */}
                        <div className="flex-1 min-w-0 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-foreground text-base">{unit.unitNumber}</span>
                              <span className="text-xs text-muted-foreground capitalize">· {unit.unitType}</span>
                            </div>
                            <span
                              className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize",
                                unit.status === "occupied"
                                  ? "bg-success-tint text-success border border-success/20"
                                  : unit.status === "reserved"
                                    ? "bg-primary-tint text-primary border border-primary/20"
                                    : "bg-warning-tint text-warning border border-warning/20"
                              )}
                            >
                              {unit.status}
                            </span>
                          </div>

                          <div className="text-xs space-y-1 text-muted-foreground pt-1 border-t border-border/60">
                            <div>
                              <span className="text-subtle-foreground">Tenant: </span>
                              <span className="text-foreground/80 font-medium">
                                {unit.activeLease?.tenantName || "Vacant"}
                              </span>
                            </div>
                            <div>
                              <span className="text-subtle-foreground">Lease: </span>
                              <span>
                                {unit.activeLease
                                  ? `${new Date(unit.activeLease.startDate).toLocaleDateString()} - ${unit.activeLease.endDate ? new Date(unit.activeLease.endDate).toLocaleDateString() : "Ongoing"}`
                                  : "—"}
                              </span>
                            </div>
                          </div>

                          <div
                            className="flex items-center justify-end space-x-2 pt-2 border-t border-border/40"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => handleOpenEditUnit(unit)}
                              title="Edit unit"
                              aria-label="Edit unit"
                              className="p-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setUnitToDelete({ id: unit.id, unitNumber: unit.unitNumber })}
                              title="Delete unit"
                              aria-label="Delete unit"
                              className="p-1.5 rounded-lg border border-border bg-card text-destructive hover:text-destructive/80 hover:bg-destructive-tint transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-border bg-card p-12 text-center">
                <p className="text-sm text-muted-foreground">No units match your search.</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={clearFilters}
                  className="mt-4 border-border text-foreground/80 hover:text-foreground hover:bg-accent h-9 px-4 text-xs"
                >
                  Clear filters
                </Button>
              </div>
            )
          ) : (
            <div className="mt-6 rounded-xl border border-border bg-card p-12 text-center">
              <p className="text-muted-foreground text-sm">This property has no units yet.</p>
              <div className="mt-4 flex justify-center space-x-3">
                <Button
                  onClick={() => setIsAddUnitOpen(true)}
                  variant="outline"
                  className="border-border text-foreground hover:bg-accent"
                >
                  Add Your First Unit
                </Button>
                <Button
                  onClick={() => setIsBulkAddOpen(true)}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                >
                  Bulk Add Units
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Floating Selection Bar on Phones (< 768px) */}
      {selectedUnitIds.length > 0 && (
        <div className="md:hidden fixed bottom-3 left-3 right-3 z-40 flex items-center justify-between px-4 py-2.5 rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-2xl animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-semibold text-foreground">
              {selectedUnitIds.length} selected
            </span>
            <button
              type="button"
              onClick={handleClearSelection}
              className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent transition-colors"
            >
              Clear
            </button>
          </div>
          <Button
            type="button"
            onClick={() => setIsBulkDeleteConfirmOpen(true)}
            className="h-8 px-3 text-xs font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </Button>
        </div>
      )}

      {/* Edit Property Modal */}
      <Modal
        open={isEditPropertyOpen}
        onOpenChange={setIsEditPropertyOpen}
        isSaving={updateProperty.isPending}
        size="md"
      >
        <ModalHeader
          title="Edit Property"
          onClose={() => setIsEditPropertyOpen(false)}
          isSaving={updateProperty.isPending}
        />
        <form onSubmit={handleUpdateProperty} className="flex flex-col flex-1 min-h-0">
          <ModalBody className="space-y-6">
            <ModalField label="Property Name" htmlFor="edit-name" required>
              <input
                id="edit-name"
                type="text"
                required
                value={propertyName}
                onChange={(e) => setPropertyName(e.target.value)}
                className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring text-sm"
              />
            </ModalField>

            <ModalField label="Street Address" htmlFor="edit-address" required>
              <input
                id="edit-address"
                type="text"
                required
                value={propertyAddress}
                onChange={(e) => setPropertyAddress(e.target.value)}
                className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring text-sm"
              />
            </ModalField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ModalField label="State" htmlFor="edit-state" required>
                <Select
                  id="edit-state"
                  required
                  value={propertyState}
                  onChange={(e) => {
                    setPropertyState(e.target.value);
                    setPropertyCity("");
                  }}
                  className="h-12"
                >
                  <option value="">Select State</option>
                  {NIGERIA_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </ModalField>

              <ModalField label="Local Government Area" htmlFor="edit-city" required>
                <Select
                  id="edit-city"
                  required
                  value={propertyCity}
                  onChange={(e) => setPropertyCity(e.target.value)}
                  disabled={!propertyState}
                  className="h-12"
                >
                  <option value="">Select LGA</option>
                  {propertyState &&
                    NIGERIA_LGAS[propertyState as keyof typeof NIGERIA_LGAS]?.map((lga) => (
                      <option key={lga} value={lga}>
                        {lga}
                      </option>
                    ))}
                </Select>
              </ModalField>
            </div>

            <ModalField label="Property Type" htmlFor="edit-propertyType">
              <Select
                id="edit-propertyType"
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value as PropertyType)}
                className="h-12"
              >
                <option value={PropertyType.residential}>Residential</option>
                <option value={PropertyType.commercial}>Commercial</option>
                <option value={PropertyType.mixed}>Mixed-Use</option>
              </Select>
            </ModalField>

            {propertyType !== PropertyType.residential && (
              <ModalField label="Expected Number of Units" htmlFor="edit-expectedUnits">
                <input
                  id="edit-expectedUnits"
                  type="number"
                  min="1"
                  value={expectedUnits}
                  onChange={(e) => setExpectedUnits(e.target.value)}
                  className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring text-sm"
                />
              </ModalField>
            )}
          </ModalBody>

          <ModalFooter
            onCancel={() => setIsEditPropertyOpen(false)}
            primaryText="Save Changes"
            isSaving={updateProperty.isPending}
          />
        </form>
      </Modal>

      {/* Delete Property Confirm Dialog */}
      <ConfirmDialog
        isOpen={isDeletePropertyConfirmOpen}
        onClose={() => setIsDeletePropertyConfirmOpen(false)}
        onConfirm={handleDeleteProperty}
        title="Delete Property"
        description={`Are you sure you want to delete "${property.name}"? This action cannot be undone.`}
        confirmText={deleteProperty.isPending ? "Deleting..." : "Delete Property"}
        isLoading={deleteProperty.isPending}
      />

      {/* Delete Unit Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(unitToDelete)}
        onClose={() => setUnitToDelete(null)}
        onConfirm={handleDeleteUnit}
        title="Delete Unit"
        description={
          unitToDelete
            ? `Are you sure you want to delete unit "${unitToDelete.unitNumber}"? This action cannot be undone.`
            : ""
        }
        confirmText={deleteUnit.isPending ? "Deleting..." : "Delete Unit"}
        isLoading={deleteUnit.isPending}
      />

      {/* Bulk Delete Units Confirm Dialog */}
      <ConfirmDialog
        isOpen={isBulkDeleteConfirmOpen}
        onClose={() => setIsBulkDeleteConfirmOpen(false)}
        onConfirm={handleConfirmBulkDelete}
        title={`Delete ${selectedUnitIds.length} ${selectedUnitIds.length === 1 ? "unit" : "units"}?`}
        description={`${selectedUnitsText} will be deleted. This can't be undone.`}
        confirmText={bulkDeleteUnits.isPending ? "Deleting..." : "Delete"}
        cancelText="Cancel"
        variant="danger"
        isLoading={bulkDeleteUnits.isPending}
      />

      {/* Add Unit Modal */}
      <Modal
        open={isAddUnitOpen}
        onOpenChange={(open) => {
          setIsAddUnitOpen(open);
          if (!open) resetUnitForm();
        }}
        isSaving={createUnit.isPending}
        size="md"
      >
        <ModalHeader
          title="Add Single Unit"
          onClose={() => {
            setIsAddUnitOpen(false);
            resetUnitForm();
          }}
          isSaving={createUnit.isPending}
        />
        <form onSubmit={handleCreateUnit} className="flex flex-col flex-1 min-h-0">
          <ModalBody className="space-y-6">
            {unitError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive-tint p-3 text-sm text-destructive">
                {unitError}
              </div>
            )}

            <ModalField label="Unit Name / Number" htmlFor="unitNumber" required>
              <input
                id="unitNumber"
                type="text"
                required
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring text-sm"
                placeholder="e.g. Flat 1, Shop 4B"
              />
            </ModalField>

            <ModalField label="Unit Type" htmlFor="unitType">
              <Select
                id="unitType"
                value={unitType}
                onChange={(e) => setUnitType(e.target.value)}
                className="h-12 capitalize"
              >
                {availableTypes.map((type) => (
                  <option key={type} value={type} className="capitalize">
                    {type}
                  </option>
                ))}
              </Select>
            </ModalField>

            {isResidentialUnitType(unitType) && (
              <ModalField label="Number of Rooms (Optional)" htmlFor="roomsCount">
                <input
                  id="roomsCount"
                  type="number"
                  min="1"
                  value={roomsCount}
                  onChange={(e) => setRoomsCount(e.target.value)}
                  className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring text-sm"
                  placeholder="e.g. 2"
                />
              </ModalField>
            )}

            <ModalField label="Floor Area in SQM (Optional)" htmlFor="sizeSqm">
              <input
                id="sizeSqm"
                type="number"
                min="1"
                step="0.1"
                value={sizeSqm}
                onChange={(e) => setSizeSqm(e.target.value)}
                className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring text-sm"
                placeholder="e.g. 75.5"
              />
            </ModalField>
          </ModalBody>

          <ModalFooter
            onCancel={() => {
              setIsAddUnitOpen(false);
              resetUnitForm();
            }}
            primaryText="Save Unit"
            isSaving={createUnit.isPending}
          />
        </form>
      </Modal>

      {/* Edit Unit Modal */}
      <Modal
        open={isEditUnitOpen}
        onOpenChange={(open) => {
          setIsEditUnitOpen(open);
          if (!open) resetEditUnitForm();
        }}
        isSaving={updateUnit.isPending}
        size="md"
      >
        <ModalHeader
          title="Edit Unit"
          onClose={() => {
            setIsEditUnitOpen(false);
            resetEditUnitForm();
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

            <ModalField label="Unit Name / Number" htmlFor="editUnitNumber" required>
              <input
                id="editUnitNumber"
                type="text"
                required
                value={editUnitNumber}
                onChange={(e) => setEditUnitNumber(e.target.value)}
                className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring text-sm"
              />
            </ModalField>

            <ModalField label="Unit Type" htmlFor="editUnitType">
              <Select
                id="editUnitType"
                value={editUnitType}
                onChange={(e) => setEditUnitType(e.target.value)}
                className="h-12 capitalize"
              >
                {availableTypes.map((type) => (
                  <option key={type} value={type} className="capitalize">
                    {type}
                  </option>
                ))}
              </Select>
            </ModalField>

            {isResidentialUnitType(editUnitType) && (
              <ModalField label="Number of Rooms (Optional)" htmlFor="editRoomsCount">
                <input
                  id="editRoomsCount"
                  type="number"
                  min="1"
                  value={editRoomsCount}
                  onChange={(e) => setEditRoomsCount(e.target.value)}
                  className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring text-sm"
                />
              </ModalField>
            )}
          </ModalBody>

          <ModalFooter
            onCancel={() => {
              setIsEditUnitOpen(false);
              resetEditUnitForm();
            }}
            primaryText="Save Changes"
            isSaving={updateUnit.isPending}
          />
        </form>
      </Modal>

      {/* Bulk Add Units Modal */}
      <Modal
        open={isBulkAddOpen}
        onOpenChange={(open) => {
          setIsBulkAddOpen(open);
          if (!open) resetBulkForm();
        }}
        isSaving={createBulkUnits.isPending}
        size="lg"
      >
        <ModalHeader
          title="Bulk Add Units"
          onClose={() => {
            setIsBulkAddOpen(false);
            resetBulkForm();
          }}
          isSaving={createBulkUnits.isPending}
        />
        <form onSubmit={handleBulkSubmit} className="flex flex-col flex-1 min-h-0">
          <ModalBody className="space-y-6">
            <ModalSegmentedControl
              value={bulkMode}
              onChange={(val) => setBulkMode(val as "range" | "manual")}
              options={[
                { value: "range", label: "Auto-Generate Range" },
                { value: "manual", label: "Manual List" },
              ]}
            />

            {bulkError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive-tint p-3 text-sm text-destructive">
                {bulkError}
              </div>
            )}

            {bulkMode === "range" ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ModalField label="Prefix">
                    <input
                      type="text"
                      value={rangePrefix}
                      onChange={(e) => setRangePrefix(e.target.value)}
                      placeholder="e.g. Flat"
                      className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring text-sm"
                    />
                  </ModalField>
                  <ModalField label="Unit Type">
                    <Select
                      value={rangeType}
                      onChange={(e) => setRangeType(e.target.value)}
                      className="h-12 capitalize"
                    >
                      {availableTypes.map((type) => (
                        <option key={type} value={type} className="capitalize">
                          {type}
                        </option>
                      ))}
                    </Select>
                  </ModalField>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ModalField label="Start Number" required>
                    <input
                      type="number"
                      min="1"
                      required
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                      className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring text-sm"
                    />
                  </ModalField>
                  <ModalField label="End Number" required>
                    <input
                      type="number"
                      min="1"
                      required
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring text-sm"
                    />
                  </ModalField>
                </div>

                {isResidentialUnitType(rangeType) && (
                  <ModalField label="Rooms (Optional)">
                    <input
                      type="number"
                      min="1"
                      value={rangeRoomsCount}
                      onChange={(e) => setRangeRoomsCount(e.target.value)}
                      placeholder="e.g. 2"
                      className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring text-sm"
                    />
                  </ModalField>
                )}

                <div className="p-3 bg-muted border border-border rounded-lg text-xs text-muted-foreground">
                  Will create{" "}
                  <span className="text-foreground font-semibold">
                    {Math.max(0, (parseInt(rangeEnd, 10) || 0) - (parseInt(rangeStart, 10) || 0) + 1)}
                  </span>{" "}
                  units: {rangePrefix.trim() ? `${rangePrefix.trim()} ${rangeStart}` : rangeStart} to {rangePrefix.trim() ? `${rangePrefix.trim()} ${rangeEnd}` : rangeEnd}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {manualRows.map((row, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={row.unitNumber}
                        onChange={(e) => {
                          const newRows = [...manualRows];
                          newRows[index].unitNumber = e.target.value;
                          setManualRows(newRows);
                        }}
                        placeholder={`Unit #${index + 1}`}
                        className="flex-1 rounded-lg border border-input bg-card px-3 h-10 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring text-sm"
                      />
                      <Select
                        value={row.unitType}
                        onChange={(e) => {
                          const newRows = [...manualRows];
                          newRows[index].unitType = e.target.value;
                          setManualRows(newRows);
                        }}
                        className="w-32 h-10 capitalize"
                      >
                        {availableTypes.map((type) => (
                          <option key={type} value={type} className="capitalize">
                            {type}
                          </option>
                        ))}
                      </Select>
                      {isResidentialUnitType(row.unitType) && (
                        <input
                          type="number"
                          min="1"
                          value={row.roomsCount}
                          onChange={(e) => {
                            const newRows = [...manualRows];
                            newRows[index].roomsCount = e.target.value;
                            setManualRows(newRows);
                          }}
                          placeholder="Rooms"
                          className="w-20 rounded-lg border border-input bg-card px-2 h-10 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring text-sm"
                        />
                      )}
                      {manualRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setManualRows(manualRows.filter((_, i) => i !== index));
                          }}
                          className="text-muted-foreground hover:text-destructive p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setManualRows([...manualRows, { unitNumber: "", unitType: defaultUnitType, roomsCount: "" }]);
                  }}
                  className="w-full border-border text-muted-foreground hover:text-foreground text-xs h-9 flex items-center justify-center gap-1.5 hover:bg-accent"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add another row
                </Button>
              </div>
            )}
          </ModalBody>

          <ModalFooter
            onCancel={() => {
              setIsBulkAddOpen(false);
              resetBulkForm();
            }}
            primaryText={createBulkUnits.isPending ? "Generating..." : "Generate Units"}
            isSaving={createBulkUnits.isPending}
          />
        </form>
      </Modal>
    </div>
  );
}
