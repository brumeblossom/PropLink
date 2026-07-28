'use client';

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { PropertyType } from "@prisma/client";
import { NIGERIA_STATES, NIGERIA_LGAS } from "@/utils/nigeriaGeo";
import { X, Trash2 } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { getUnitTypesByPropertyType, isResidentialUnitType } from "@/lib/unit-types";

export default function PropertyDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const propertyId = params.id as string;
  const utils = trpc.useUtils();

  const bulkAddParam = searchParams.get("bulkAdd");

  // Queries
  const { data: properties, isLoading: isLoadingProperty } = trpc.properties.list.useQuery();
  const { data: units, isLoading: isLoadingUnits } = trpc.units.listByProperty.useQuery({ propertyId });

  // Mutations
  const updateProperty = trpc.properties.update.useMutation({
    onSuccess: () => {
      utils.properties.list.invalidate();
      setIsEditPropertyOpen(false);
    },
  });

  const deleteProperty = trpc.properties.delete.useMutation({
    onSuccess: () => {
      utils.properties.list.invalidate();
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
      setIsAddUnitOpen(false);
      resetUnitForm();
    },
    onError: (err) => {
      setUnitError(err.message);
    },
  });

  const createBulkUnits = trpc.units.createBulk.useMutation({
    onSuccess: () => {
      utils.units.listByProperty.invalidate({ propertyId });
      utils.properties.list.invalidate();
      setIsBulkAddOpen(false);
      resetBulkForm();
    },
    onError: (err) => {
      setBulkError(err.message);
    },
  });

  const updateUnit = trpc.units.update.useMutation({
    onSuccess: () => {
      utils.units.listByProperty.invalidate({ propertyId });
      utils.properties.list.invalidate();
      setIsEditUnitOpen(false);
      resetEditUnitForm();
    },
    onError: (err) => {
      setEditUnitError(err.message);
    },
  });

  const deleteUnit = trpc.units.delete.useMutation({
    onSuccess: () => {
      utils.units.listByProperty.invalidate({ propertyId });
      utils.properties.list.invalidate();
    },
    onError: (err) => {
      setDeleteError(err.message);
    },
  });

  // State
  const [isEditPropertyOpen, setIsEditPropertyOpen] = useState(false);
  const [isAddUnitOpen, setIsAddUnitOpen] = useState(false);
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);

  // Property Form State
  const [propertyName, setPropertyName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [propertyCity, setPropertyCity] = useState("");
  const [propertyState, setPropertyState] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>(PropertyType.residential);
  const [expectedUnits, setExpectedUnits] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Unit Edit Form State
  const [isEditUnitOpen, setIsEditUnitOpen] = useState(false);
  const [editUnitId, setEditUnitId] = useState("");
  const [editUnitNumber, setEditUnitNumber] = useState("");
  const [editUnitType, setEditUnitType] = useState("");
  const [editRoomsCount, setEditRoomsCount] = useState("");
  const [editUnitError, setEditUnitError] = useState<string | null>(null);

  // Find current property
  const property = properties?.find((p) => p.id === propertyId);

  // Dynamic unit types logic based on property type
  const allowedUnitTypes = property ? getUnitTypesByPropertyType(property.propertyType) : [];
  const defaultUnitType = allowedUnitTypes[0] || "";

  // Unit Form State
  const [unitNumber, setUnitNumber] = useState("");
  const [unitType, setUnitType] = useState("");
  const [roomsCount, setRoomsCount] = useState("");
  const [sizeSqm, setSizeSqm] = useState("");
  const [unitError, setUnitError] = useState<string | null>(null);

  // Bulk Form States
  const [bulkMode, setBulkMode] = useState<"range" | "manual">("range");
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Range Generator State
  const [rangePrefix, setRangePrefix] = useState("");
  const [rangeStart, setRangeStart] = useState("1");
  const [rangeEnd, setRangeEnd] = useState("10");
  const [rangeType, setRangeType] = useState("");
  const [rangeRoomsCount, setRangeRoomsCount] = useState("");

  // Manual Multi-row State
  const [manualRows, setManualRows] = useState<Array<{ unitNumber: string; unitType: string; roomsCount: string }>>([]);

  // Auto-init types when property type loads
  useEffect(() => {
    if (defaultUnitType) {
      setUnitType(defaultUnitType);
      setRangeType(defaultUnitType);
      setManualRows([
        { unitNumber: "", unitType: defaultUnitType, roomsCount: "" },
        { unitNumber: "", unitType: defaultUnitType, roomsCount: "" },
        { unitNumber: "", unitType: defaultUnitType, roomsCount: "" },
      ]);
    }
  }, [defaultUnitType]);

  const resetBulkForm = () => {
    setBulkMode("range");
    setBulkError(null);
    setRangePrefix("");
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

      for (let i = start; i <= end; i++) {
        unitsToCreate.push({
          unitNumber: `${rangePrefix}${i}`.trim(),
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

      const unitNumbers = validRows.map(r => r.unitNumber.trim());
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
    if (confirm("Are you sure you want to delete this property? This action is permanent.")) {
      try {
        await deleteProperty.mutateAsync({ id: propertyId });
      } catch (err) {
        console.error(err);
      }
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

  const handleUpdateUnit = async (e: React.FormEvent) => {
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

  const handleDeleteUnit = async (id: string) => {
    setDeleteError(null);
    if (confirm("Are you sure you want to delete this unit? This action is permanent.")) {
      try {
        await deleteUnit.mutateAsync({ id });
      } catch {
        // handled
      }
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

  if (isLoadingProperty || isLoadingUnits) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-white">
        <p className="text-lg">Loading details...</p>
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
      {/* Top Navbar */}
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4 ml-10 md:ml-0">
            <Link href="/landlord" className="text-xl font-bold tracking-tight text-white hover:opacity-90">
              PropLink
            </Link>
            <span className="text-neutral-500">/</span>
            <Link href="/landlord/properties" className="text-sm font-medium text-neutral-400 hover:text-white transition-colors">
              Properties
            </Link>
            <span className="text-neutral-500">/</span>
            <span className="text-sm font-medium text-neutral-300 truncate max-w-[150px]">{property.name}</span>
          </div>

          <div className="flex items-center space-x-3">
            <Button
              onClick={handleOpenEdit}
              variant="outline"
              className="border-neutral-800 text-white hover:bg-neutral-900 h-9 text-sm"
            >
              Edit Property
            </Button>
            <Button
              onClick={handleDeleteProperty}
              variant="destructive"
              className="bg-red-950/30 text-red-400 border border-red-900/50 hover:bg-red-950/60 h-9 text-sm"
            >
              Delete Property
            </Button>
            <Button
              onClick={() => setIsAddUnitOpen(true)}
              variant="outline"
              className="border-neutral-800 text-white hover:bg-neutral-900 h-9 px-4 text-sm"
            >
              Add Unit
            </Button>
            <Button
              onClick={() => setIsBulkAddOpen(true)}
              className="bg-white text-neutral-950 hover:bg-neutral-200 h-9 px-4 text-sm font-semibold"
            >
              Bulk Add Units
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <BackButton href="/landlord/properties" label="Back to Properties" />
        {deleteError && (
          <div className="mb-6 rounded-lg border border-red-900/30 bg-red-950/20 p-4 text-sm text-red-400">
            {deleteError}
          </div>
        )}

        {/* Property Info Header card */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-8 backdrop-blur-sm">
          <div className="flex justify-between items-start">
            <div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-300 capitalize">
                {property.propertyType}
              </span>
              <h1 className="text-3xl font-extrabold tracking-tight mt-2">{property.name}</h1>
              <p className="text-neutral-400 mt-2 text-sm">{property.address}, {property.city}, {property.state}</p>
            </div>
            <div className="text-right">
              <span className="block text-sm text-neutral-500 font-medium">Total Units</span>
              <span className="text-3xl font-bold mt-1 block">{units?.length || 0}</span>
            </div>
          </div>
        </div>

        {/* Units Section */}
        <div className="mt-10">
          <h2 className="text-xl font-bold tracking-tight">Units in this Building</h2>

          {units && units.length > 0 ? (
            <div className="mt-6 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/20 backdrop-blur-sm">
              <table className="min-w-full divide-y divide-neutral-800">
                <thead className="bg-neutral-900/50">
                  <tr>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                      Unit Name/Number
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                      Unit Type
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                      Current Tenant
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                      Lease Range
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-right text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 bg-transparent">
                  {units.map((unit) => (
                    <tr
                      key={unit.id}
                      className="hover:bg-neutral-900/20 transition-colors cursor-pointer"
                      onClick={() => router.push(`/landlord/properties/${propertyId}/units/${unit.id}`)}
                    >
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-white">
                        {unit.unitNumber}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-neutral-300 capitalize">
                        {unit.unitType}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            unit.status === "occupied"
                              ? "bg-green-950/30 text-green-400 border border-green-900/30"
                              : "bg-yellow-950/30 text-yellow-400 border border-yellow-900/30"
                          }`}
                        >
                          {unit.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-neutral-300">
                        {unit.activeLease?.tenantName || <span className="text-neutral-500">Vacant</span>}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-neutral-400">
                        {unit.activeLease
                          ? `${new Date(unit.activeLease.startDate).toLocaleDateString()} - ${new Date(unit.activeLease.endDate).toLocaleDateString()}`
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-right font-medium" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => handleOpenEditUnit(unit)}
                            className="text-xs text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 hover:border-neutral-700 px-2 py-1 rounded transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteUnit(unit.id)}
                            className="text-xs text-red-400 hover:text-red-300 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 px-2 py-1 rounded transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                    <select
                      id="edit-state"
                      required
                      value={propertyState}
                      onChange={(e) => {
                        setPropertyState(e.target.value);
                        setPropertyCity(""); // Reset LGA (city column) when state changes
                      }}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-[38px]"
                    >
                      <option value="">Select State</option>
                      {NIGERIA_STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="edit-city" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Local Government Area
                    </label>
                    <select
                      id="edit-city"
                      required
                      value={propertyCity}
                      onChange={(e) => setPropertyCity(e.target.value)}
                      disabled={!propertyState}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-[38px] disabled:opacity-50"
                    >
                      <option value="">Select LGA</option>
                      {propertyState &&
                        NIGERIA_LGAS[propertyState as keyof typeof NIGERIA_LGAS]?.map((lga) => (
                          <option key={lga} value={lga}>
                            {lga}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="edit-propertyType" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Property Type
                  </label>
                  <select
                    id="edit-propertyType"
                    value={propertyType}
                    onChange={(e) => setPropertyType(e.target.value as PropertyType)}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-[38px]"
                  >
                    <option value={PropertyType.residential}>Residential</option>
                    <option value={PropertyType.commercial}>Commercial</option>
                    <option value={PropertyType.mixed}>Mixed-Use</option>
                  </select>
                </div>

                {propertyType !== PropertyType.residential && (
                  <div className="mt-4">
                    <label htmlFor="edit-expectedUnits" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Expected Number of Units
                    </label>
                    <input
                      id="edit-expectedUnits"
                      type="number"
                      min="1"
                      value={expectedUnits}
                      onChange={(e) => setExpectedUnits(e.target.value)}
                      placeholder="e.g. 20"
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

      {/* Add Unit Modal */}
      {isAddUnitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-8 shadow-2xl flex flex-col space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold tracking-tight">Add New Unit</h2>
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
                    Unit Number / Name
                  </label>
                  <input
                    id="unitNumber"
                    type="text"
                    required
                    value={unitNumber}
                    onChange={(e) => setUnitNumber(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                    placeholder="e.g. Flat 101, Shop 5"
                  />
                </div>

                <div>
                  <label htmlFor="unitType" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Unit Type
                  </label>
                  <select
                    id="unitType"
                    value={unitType}
                    onChange={(e) => {
                      setUnitType(e.target.value);
                      setRoomsCount("");
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

                {isResidentialUnitType(unitType) && (
                  <div>
                    <label htmlFor="roomsCount" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Number of Rooms
                    </label>
                    <input
                      id="roomsCount"
                      type="number"
                      min="0"
                      value={roomsCount}
                      onChange={(e) => setRoomsCount(e.target.value)}
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
                  {createUnit.isPending ? "Adding..." : "Add Unit"}
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

            <form onSubmit={handleUpdateUnit} className="space-y-4">
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

      {/* Bulk Add Unit Modal */}
      {isBulkAddOpen && property && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl my-8">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-neutral-800">
              <div>
                <h2 className="text-xl font-bold text-white font-sans">Bulk Add Units</h2>
                <p className="text-sm text-neutral-400 font-sans mt-0.5">Adding to {property.name}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsBulkAddOpen(false);
                  resetBulkForm();
                }}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Selector Tabs */}
            <div className="flex bg-neutral-900 p-1 rounded-lg mb-6 border border-neutral-800">
              <button
                type="button"
                onClick={() => { setBulkMode("range"); setBulkError(null); }}
                className={`w-1/2 py-2 text-sm font-semibold rounded-md transition-all ${
                  bulkMode === "range"
                    ? "bg-white text-neutral-950 shadow"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Sequential Range Generator
              </button>
              <button
                type="button"
                onClick={() => { setBulkMode("manual"); setBulkError(null); }}
                className={`w-1/2 py-2 text-sm font-semibold rounded-md transition-all ${
                  bulkMode === "manual"
                    ? "bg-white text-neutral-950 shadow"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Manual Multi-Row Entry
              </button>
            </div>

            <form onSubmit={handleBulkSubmit} className="space-y-4">
              {bulkError && (
                <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-3 text-sm text-red-400 font-sans">
                  {bulkError}
                </div>
              )}

              {bulkMode === "range" ? (
                /* Range Mode Fields */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="rangePrefix" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Name Prefix (optional)
                    </label>
                    <input
                      id="rangePrefix"
                      type="text"
                      value={rangePrefix}
                      onChange={(e) => setRangePrefix(e.target.value)}
                      placeholder="e.g. Flat, Shop, Room"
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                    />
                  </div>

                  <div>
                    <label htmlFor="rangeType" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Unit Type
                    </label>
                    <select
                      id="rangeType"
                      value={rangeType}
                      onChange={(e) => {
                        setRangeType(e.target.value);
                        setRangeRoomsCount("");
                      }}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                    >
                      {allowedUnitTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>

                  {isResidentialUnitType(rangeType) && (
                    <div>
                      <label htmlFor="rangeRoomsCount" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                        Number of Rooms
                      </label>
                      <input
                        id="rangeRoomsCount"
                        type="number"
                        min="0"
                        value={rangeRoomsCount}
                        onChange={(e) => setRangeRoomsCount(e.target.value)}
                        placeholder="e.g. 3"
                        className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="rangeStart" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Start Number
                    </label>
                    <input
                      id="rangeStart"
                      type="number"
                      required
                      min="1"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                    />
                  </div>

                  <div>
                    <label htmlFor="rangeEnd" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      End Number
                    </label>
                    <input
                      id="rangeEnd"
                      type="number"
                      required
                      min="1"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                    />
                  </div>
                </div>
              ) : (
                /* Manual Mode Form */
                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2">
                  <div className="grid grid-cols-12 gap-3 text-xs font-semibold text-neutral-400 uppercase tracking-wider px-2">
                    <div className="col-span-5">Unit Number / Name</div>
                    <div className="col-span-4">Unit Type</div>
                    <div className="col-span-2 text-center">Rooms</div>
                    <div className="col-span-1 text-center"></div>
                  </div>

                  {manualRows.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-3 items-center">
                      <div className="col-span-5">
                        <input
                          type="text"
                          required={idx === 0}
                          value={row.unitNumber}
                          onChange={(e) => {
                            const newRows = [...manualRows];
                            newRows[idx].unitNumber = e.target.value;
                            setManualRows(newRows);
                          }}
                          placeholder={`e.g. Suite ${idx + 1}`}
                          className="block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                        />
                      </div>
                      <div className="col-span-4">
                        <select
                          value={row.unitType}
                          onChange={(e) => {
                            const newRows = [...manualRows];
                            newRows[idx].unitType = e.target.value;
                            if (!isResidentialUnitType(e.target.value)) {
                              newRows[idx].roomsCount = "";
                            }
                            setManualRows(newRows);
                          }}
                          className="block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                        >
                          {allowedUnitTypes.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="0"
                          disabled={!isResidentialUnitType(row.unitType)}
                          value={row.roomsCount}
                          onChange={(e) => {
                            const newRows = [...manualRows];
                            newRows[idx].roomsCount = e.target.value;
                            setManualRows(newRows);
                          }}
                          placeholder="-"
                          className="block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-2 text-white text-center placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10 disabled:opacity-30 disabled:cursor-not-allowed"
                        />
                      </div>
                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            if (manualRows.length > 1) {
                              setManualRows(manualRows.filter((_, i) => i !== idx));
                            } else {
                              setManualRows([{ unitNumber: "", unitType: defaultUnitType, roomsCount: "" }]);
                            }
                          }}
                          className="text-red-400 hover:text-red-300 p-1.5"
                          title="Remove unit"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => setManualRows([...manualRows, { unitNumber: "", unitType: defaultUnitType, roomsCount: "" }])}
                    className="w-full py-2.5 rounded-lg border border-dashed border-neutral-800 text-sm font-medium text-neutral-400 hover:text-white hover:border-neutral-700 hover:bg-neutral-900/30 transition-colors flex items-center justify-center space-x-1.5 mt-2"
                  >
                    <span>+ Add Row</span>
                  </button>
                </div>
              )}

              <div className="flex space-x-3 mt-8 pt-4 border-t border-neutral-800">
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
                  {createBulkUnits.isPending ? "Adding..." : "Add Units"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
