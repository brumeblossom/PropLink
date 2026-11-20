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
import { useToast } from "@/components/ui/toast";
import { PropertyType } from "@prisma/client";
import { NIGERIA_STATES, NIGERIA_LGAS } from "@/utils/nigeriaGeo";
import { X, Trash2, ChevronDown, Plus, Pencil, Search } from "lucide-react";
import { getUnitTypesByPropertyType, isResidentialUnitType } from "@/lib/unit-types";
import { cn } from "@/lib/utils";

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

  // Search & Filters state (synced with URL)
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [typeFilter, setTypeFilter] = useState(searchParams.get("type") || "all");

  const updateFilters = (newQ: string, newStatus: string, newType: string) => {
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

  if (isLoadingProperty || isLoadingUnits) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white">
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
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 backdrop-blur-sm space-y-3">
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 text-white">
        <p className="text-lg">Property not found.</p>
        <Link href="/landlord/properties" className="text-sm underline mt-2">
          Back to properties
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
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
              label: "Edit Property",
              onClick: handleOpenEdit,
              icon: <Pencil className="w-4 h-4" />,
              variant: "outline",
            },
            {
              label: "Delete Property",
              onClick: () => setIsDeletePropertyConfirmOpen(true),
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

        {/* Property Info Header card (Total Units removed) */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-6 backdrop-blur-sm">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-300 capitalize inline-block">
            {property.propertyType}
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight mt-2">{property.name}</h1>
          <p className="text-neutral-400 mt-2 text-sm">
            {property.address}, {property.city}, {property.state}
          </p>
        </div>

        {/* Units Section */}
        <div className="pt-2">
          {/* Section heading + Add Unit button */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight">All Units</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-400">
                {units?.length || 0}
              </span>
            </div>

            {/* Unified Add Unit dropdown */}
            <div className="relative" ref={dropdownRef}>
              <Button
                onClick={() => setIsAddDropdownOpen(!isAddDropdownOpen)}
                className="bg-white text-neutral-950 hover:bg-neutral-200 h-9 px-4 text-sm font-semibold flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-400"
                aria-expanded={isAddDropdownOpen}
                aria-haspopup="menu"
              >
                <Plus className="w-4 h-4" />
                <span>Add Unit</span>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 transition-transform duration-200",
                    isAddDropdownOpen && "transform rotate-180"
                  )}
                />
              </Button>
              {isAddDropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-48 rounded-xl border border-neutral-800 bg-neutral-950 p-1.5 shadow-2xl z-50 animate-in fade-in duration-100"
                  role="menu"
                >
                  <button
                    onClick={() => {
                      setIsAddDropdownOpen(false);
                      setIsAddUnitOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-neutral-300 hover:text-white hover:bg-neutral-900 transition-colors focus:outline-none focus:bg-neutral-900"
                    role="menuitem"
                  >
                    Add Single Unit
                  </button>
                  <button
                    onClick={() => {
                      setIsAddDropdownOpen(false);
                      setIsBulkAddOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-neutral-300 hover:text-white hover:bg-neutral-900 transition-colors focus:outline-none focus:bg-neutral-900"
                    role="menuitem"
                  >
                    Add Bulk Units
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Search and Filters Toolbar */}
          {units && units.length > 0 && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              <div className="flex flex-col md:flex-row md:items-center gap-2.5 flex-1">
                {/* Search Input */}
                <div className="relative w-full md:w-[280px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => updateFilters(e.target.value, statusFilter, typeFilter)}
                    placeholder="Search unit or tenant"
                    className="w-full rounded-lg border border-neutral-800 bg-neutral-900 pl-9 pr-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 h-9"
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
                    className="text-xs text-neutral-400 hover:text-white underline py-1 px-1 transition-colors self-start md:self-auto"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Filtered count on right: only when filtering */}
              {isFiltering && (
                <span className="text-xs text-neutral-500 font-medium whitespace-nowrap self-end md:self-auto">
                  {filteredUnits.length} of {units.length} units
                </span>
              )}
            </div>
          )}

          {/* Units View */}
          {units && units.length > 0 ? (
            filteredUnits.length > 0 ? (
              <>
                {/* Desktop Table: Unit Name/Number | Unit Type | Current Tenant | Lease Range | Status | Actions */}
                <div className="hidden md:block overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/20 backdrop-blur-sm">
                  <table className="min-w-full divide-y divide-neutral-800">
                    <thead className="bg-neutral-900/50">
                      <tr>
                        <th
                          scope="col"
                          className="px-6 py-3.5 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider"
                        >
                          Unit Name/Number
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3.5 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider"
                        >
                          Unit Type
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3.5 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider"
                        >
                          Current Tenant
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3.5 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider"
                        >
                          Lease Range
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3.5 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider"
                        >
                          Status
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3.5 text-right text-xs font-semibold text-neutral-400 uppercase tracking-wider"
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/60 bg-transparent">
                      {filteredUnits.map((unit) => (
                        <tr
                          key={unit.id}
                          className="hover:bg-neutral-900/30 transition-colors cursor-pointer"
                          onClick={() => router.push(`/landlord/properties/${propertyId}/units/${unit.id}`)}
                        >
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-white">
                            {unit.unitNumber}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-neutral-300 capitalize">
                            {unit.unitType}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-neutral-300">
                            {unit.activeLease?.tenantName || (
                              <span className="text-neutral-500">Vacant</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-neutral-400">
                            {unit.activeLease
                              ? `${new Date(unit.activeLease.startDate).toLocaleDateString()} - ${new Date(unit.activeLease.endDate).toLocaleDateString()}`
                              : "—"}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm">
                            <span
                              className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold",
                                unit.status === "occupied"
                                  ? "bg-green-950/30 text-green-400 border border-green-900/30"
                                  : "bg-yellow-950/30 text-yellow-400 border border-yellow-900/30"
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
                                className="p-1.5 text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-lg transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setUnitToDelete({ id: unit.id, unitNumber: unit.unitNumber })}
                                title="Delete unit"
                                aria-label="Delete unit"
                                className="p-1.5 text-rose-400 hover:text-rose-300 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Stacked Cards (< 768px) */}
                <div className="md:hidden space-y-3">
                  {filteredUnits.map((unit) => (
                    <div
                      key={unit.id}
                      onClick={() => router.push(`/landlord/properties/${propertyId}/units/${unit.id}`)}
                      className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-4 space-y-3 cursor-pointer hover:bg-neutral-900/40 hover:border-neutral-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-white text-base">{unit.unitNumber}</span>
                          <span className="text-xs text-neutral-400 capitalize">· {unit.unitType}</span>
                        </div>
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold",
                            unit.status === "occupied"
                              ? "bg-green-950/30 text-green-400 border border-green-900/30"
                              : "bg-yellow-950/30 text-yellow-400 border border-yellow-900/30"
                          )}
                        >
                          {unit.status}
                        </span>
                      </div>

                      <div className="text-xs space-y-1 text-neutral-400 pt-1 border-t border-neutral-800/60">
                        <div>
                          <span className="text-neutral-500">Tenant: </span>
                          <span className="text-neutral-300 font-medium">
                            {unit.activeLease?.tenantName || "Vacant"}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-500">Lease: </span>
                          <span>
                            {unit.activeLease
                              ? `${new Date(unit.activeLease.startDate).toLocaleDateString()} - ${new Date(unit.activeLease.endDate).toLocaleDateString()}`
                              : "—"}
                          </span>
                        </div>
                      </div>

                      <div
                        className="flex items-center justify-end space-x-2 pt-2 border-t border-neutral-800/40"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleOpenEditUnit(unit)}
                          title="Edit unit"
                          aria-label="Edit unit"
                          className="p-1.5 rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-850 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setUnitToDelete({ id: unit.id, unitNumber: unit.unitNumber })}
                          title="Delete unit"
                          aria-label="Delete unit"
                          className="p-1.5 rounded-lg border border-neutral-800 bg-neutral-900 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-12 text-center">
                <p className="text-sm text-neutral-400">No units match your search.</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={clearFilters}
                  className="mt-4 border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-850 h-9 px-4 text-xs"
                >
                  Clear filters
                </Button>
              </div>
            )
          ) : (
            <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/10 p-12 text-center">
              <p className="text-neutral-400 text-sm">This property has no units yet.</p>
              <div className="mt-4 flex justify-center space-x-3">
                <Button
                  onClick={() => setIsAddUnitOpen(true)}
                  variant="outline"
                  className="border-neutral-800 text-white hover:bg-neutral-900"
                >
                  Add Your First Unit
                </Button>
                <Button
                  onClick={() => setIsBulkAddOpen(true)}
                  className="bg-white text-neutral-950 hover:bg-neutral-200 font-semibold"
                >
                  Bulk Add Units
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Edit Property Modal */}
      {isEditPropertyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-8 shadow-2xl flex flex-col space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold tracking-tight">Edit Property</h2>
              <button onClick={() => setIsEditPropertyOpen(false)} className="text-neutral-400 hover:text-white">
                &times;
              </button>
            </div>

            <form onSubmit={handleUpdateProperty} className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label htmlFor="edit-name" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Property Name
                  </label>
                  <input
                    id="edit-name"
                    type="text"
                    required
                    value={propertyName}
                    onChange={(e) => setPropertyName(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="edit-address" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Street Address
                  </label>
                  <input
                    id="edit-address"
                    type="text"
                    required
                    value={propertyAddress}
                    onChange={(e) => setPropertyAddress(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="edit-state" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      State
                    </label>
                    <Select
                      id="edit-state"
                      required
                      value={propertyState}
                      onChange={(e) => {
                        setPropertyState(e.target.value);
                        setPropertyCity("");
                      }}
                      className="mt-1"
                    >
                      <option value="">Select State</option>
                      {NIGERIA_STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label htmlFor="edit-city" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Local Government Area
                    </label>
                    <Select
                      id="edit-city"
                      required
                      value={propertyCity}
                      onChange={(e) => setPropertyCity(e.target.value)}
                      disabled={!propertyState}
                      className="mt-1"
                    >
                      <option value="">Select LGA</option>
                      {propertyState &&
                        NIGERIA_LGAS[propertyState as keyof typeof NIGERIA_LGAS]?.map((lga) => (
                          <option key={lga} value={lga}>
                            {lga}
                          </option>
                        ))}
                    </Select>
                  </div>
                </div>

                <div>
                  <label htmlFor="edit-propertyType" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Property Type
                  </label>
                  <Select
                    id="edit-propertyType"
                    value={propertyType}
                    onChange={(e) => setPropertyType(e.target.value as PropertyType)}
                    className="mt-1"
                  >
                    <option value={PropertyType.residential}>Residential</option>
                    <option value={PropertyType.commercial}>Commercial</option>
                    <option value={PropertyType.mixed}>Mixed-Use</option>
                  </Select>
                </div>

                {propertyType !== PropertyType.residential && (
                  <div>
                    <label htmlFor="edit-expectedUnits" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Expected Number of Units
                    </label>
                    <input
                      id="edit-expectedUnits"
                      type="number"
                      min="1"
                      value={expectedUnits}
                      onChange={(e) => setExpectedUnits(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-[38px]"
                    />
                  </div>
                )}
              </div>

              <div className="flex space-x-3 mt-6 pt-4 border-t border-neutral-800">
                <Button
                  type="button"
                  onClick={() => setIsEditPropertyOpen(false)}
                  variant="outline"
                  className="w-1/2 border-neutral-800 text-white hover:bg-neutral-900 h-10 text-sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateProperty.isPending}
                  className="w-1/2 bg-white text-neutral-950 hover:bg-neutral-200 h-10 text-sm"
                >
                  {updateProperty.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

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

      {/* Add Unit Modal */}
      {isAddUnitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-8 shadow-2xl flex flex-col space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold tracking-tight">Add Single Unit</h2>
              <button
                onClick={() => {
                  setIsAddUnitOpen(false);
                  resetUnitForm();
                }}
                className="text-neutral-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateUnit} className="space-y-4">
              {unitError && (
                <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-3 text-sm text-red-400">
                  {unitError}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label htmlFor="unitNumber" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Unit Name / Number
                  </label>
                  <input
                    id="unitNumber"
                    type="text"
                    required
                    value={unitNumber}
                    onChange={(e) => setUnitNumber(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                    placeholder="e.g. Flat 1, Shop 4B"
                  />
                </div>

                <div>
                  <label htmlFor="unitType" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Unit Type
                  </label>
                  <Select
                    id="unitType"
                    value={unitType}
                    onChange={(e) => setUnitType(e.target.value)}
                    className="mt-1 capitalize"
                  >
                    {availableTypes.map((type) => (
                      <option key={type} value={type} className="capitalize">
                        {type}
                      </option>
                    ))}
                  </Select>
                </div>

                {isResidentialUnitType(unitType) && (
                  <div>
                    <label htmlFor="roomsCount" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Number of Rooms (Optional)
                    </label>
                    <input
                      id="roomsCount"
                      type="number"
                      min="1"
                      value={roomsCount}
                      onChange={(e) => setRoomsCount(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-[38px]"
                      placeholder="e.g. 2"
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="sizeSqm" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Floor Area in SQM (Optional)
                  </label>
                  <input
                    id="sizeSqm"
                    type="number"
                    min="1"
                    step="0.1"
                    value={sizeSqm}
                    onChange={(e) => setSizeSqm(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-[38px]"
                    placeholder="e.g. 75.5"
                  />
                </div>
              </div>

              <div className="flex space-x-3 mt-6 pt-4 border-t border-neutral-800">
                <Button
                  type="button"
                  onClick={() => {
                    setIsAddUnitOpen(false);
                    resetUnitForm();
                  }}
                  variant="outline"
                  className="w-1/2 border-neutral-800 text-white hover:bg-neutral-900 h-10 text-sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createUnit.isPending}
                  className="w-1/2 bg-white text-neutral-950 hover:bg-neutral-200 h-10 text-sm"
                >
                  {createUnit.isPending ? "Creating..." : "Save Unit"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Unit Modal */}
      {isEditUnitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-8 shadow-2xl flex flex-col space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold tracking-tight">Edit Unit</h2>
              <button
                onClick={() => {
                  setIsEditUnitOpen(false);
                  resetEditUnitForm();
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
                    Unit Name / Number
                  </label>
                  <input
                    id="editUnitNumber"
                    type="text"
                    required
                    value={editUnitNumber}
                    onChange={(e) => setEditUnitNumber(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="editUnitType" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Unit Type
                  </label>
                  <Select
                    id="editUnitType"
                    value={editUnitType}
                    onChange={(e) => setEditUnitType(e.target.value)}
                    className="mt-1 capitalize"
                  >
                    {availableTypes.map((type) => (
                      <option key={type} value={type} className="capitalize">
                        {type}
                      </option>
                    ))}
                  </Select>
                </div>

                {isResidentialUnitType(editUnitType) && (
                  <div>
                    <label htmlFor="editRoomsCount" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Number of Rooms (Optional)
                    </label>
                    <input
                      id="editRoomsCount"
                      type="number"
                      min="1"
                      value={editRoomsCount}
                      onChange={(e) => setEditRoomsCount(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-[38px]"
                    />
                  </div>
                )}
              </div>

              <div className="flex space-x-3 mt-6 pt-4 border-t border-neutral-800">
                <Button
                  type="button"
                  onClick={() => {
                    setIsEditUnitOpen(false);
                    resetEditUnitForm();
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

      {/* Bulk Add Units Modal */}
      {isBulkAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md">
          <div className="w-full max-w-xl rounded-2xl border border-neutral-800 bg-neutral-950 p-8 shadow-2xl flex flex-col space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold tracking-tight">Bulk Add Units</h2>
              <button
                onClick={() => {
                  setIsBulkAddOpen(false);
                  resetBulkForm();
                }}
                className="text-neutral-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            {/* Mode Toggle */}
            <div className="flex bg-neutral-900 p-1 rounded-lg border border-neutral-800">
              <button
                type="button"
                onClick={() => setBulkMode("range")}
                className={cn(
                  "flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors",
                  bulkMode === "range" ? "bg-white text-neutral-950 shadow" : "text-neutral-400 hover:text-white"
                )}
              >
                Auto-Generate Range
              </button>
              <button
                type="button"
                onClick={() => setBulkMode("manual")}
                className={cn(
                  "flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors",
                  bulkMode === "manual" ? "bg-white text-neutral-950 shadow" : "text-neutral-400 hover:text-white"
                )}
              >
                Manual List
              </button>
            </div>

            <form onSubmit={handleBulkSubmit} className="space-y-4">
              {bulkError && (
                <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-3 text-sm text-red-400">
                  {bulkError}
                </div>
              )}

              {bulkMode === "range" ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                        Prefix
                      </label>
                      <input
                        type="text"
                        value={rangePrefix}
                        onChange={(e) => setRangePrefix(e.target.value)}
                        placeholder="e.g. Flat"
                        className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                        Unit Type
                      </label>
                      <Select
                        value={rangeType}
                        onChange={(e) => setRangeType(e.target.value)}
                        className="mt-1 capitalize"
                      >
                        {availableTypes.map((type) => (
                          <option key={type} value={type} className="capitalize">
                            {type}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                        Start Number
                      </label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={rangeStart}
                        onChange={(e) => setRangeStart(e.target.value)}
                        className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                        End Number
                      </label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={rangeEnd}
                        onChange={(e) => setRangeEnd(e.target.value)}
                        className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-white text-sm"
                      />
                    </div>
                  </div>

                  {isResidentialUnitType(rangeType) && (
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                        Rooms (Optional)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={rangeRoomsCount}
                        onChange={(e) => setRangeRoomsCount(e.target.value)}
                        placeholder="e.g. 2"
                        className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-white text-sm"
                      />
                    </div>
                  )}

                  <div className="p-3 bg-neutral-900/50 border border-neutral-800 rounded-lg text-xs text-neutral-400">
                    Will create{" "}
                    <span className="text-white font-semibold">
                      {Math.max(0, (parseInt(rangeEnd, 10) || 0) - (parseInt(rangeStart, 10) || 0) + 1)}
                    </span>{" "}
                    units: {rangePrefix.trim() ? `${rangePrefix.trim()} ${rangeStart}` : rangeStart} to {rangePrefix.trim() ? `${rangePrefix.trim()} ${rangeEnd}` : rangeEnd}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
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
                          className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-white text-sm"
                        />
                        <Select
                          value={row.unitType}
                          onChange={(e) => {
                            const newRows = [...manualRows];
                            newRows[index].unitType = e.target.value;
                            setManualRows(newRows);
                          }}
                          className="w-32 capitalize"
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
                            className="w-20 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-white text-sm"
                          />
                        )}
                        {manualRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setManualRows(manualRows.filter((_, i) => i !== index));
                            }}
                            className="text-neutral-500 hover:text-red-400 p-1"
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
                    className="w-full border-neutral-800 text-neutral-400 hover:text-white text-xs h-8"
                  >
                    + Add Another Row
                  </Button>
                </div>
              )}

              <div className="flex space-x-3 mt-6 pt-4 border-t border-neutral-800">
                <Button
                  type="button"
                  onClick={() => {
                    setIsBulkAddOpen(false);
                    resetBulkForm();
                  }}
                  variant="outline"
                  className="w-1/2 border-neutral-800 text-white hover:bg-neutral-900 h-10 text-sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createBulkUnits.isPending}
                  className="w-1/2 bg-white text-neutral-950 hover:bg-neutral-200 h-10 text-sm font-semibold"
                >
                  {createBulkUnits.isPending ? "Generating..." : "Generate Units"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
