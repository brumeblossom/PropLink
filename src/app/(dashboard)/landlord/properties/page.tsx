'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { PropertyType } from "@prisma/client";
import { NIGERIA_STATES, NIGERIA_LGAS } from "@/utils/nigeriaGeo";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

export default function PropertiesPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const { data: properties, isLoading } = trpc.properties.list.useQuery();

  const [isNudgeOpen, setIsNudgeOpen] = useState(false);
  const [createdPropertyInfo, setCreatedPropertyInfo] = useState<{ id: string; name: string } | null>(null);

  // Card menu & modals state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [propertyToEdit, setPropertyToEdit] = useState<{
    id: string;
    name: string;
    address: string;
    city: string;
    state: string;
    propertyType: PropertyType;
    expectedUnits: number | null;
  } | null>(null);
  const [propertyToDelete, setPropertyToDelete] = useState<{ id: string; name: string } | null>(null);

  // Add Form state
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>(PropertyType.residential);
  const [expectedUnits, setExpectedUnits] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Edit Form state
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editState, setEditState] = useState("");
  const [editPropertyType, setEditPropertyType] = useState<PropertyType>(PropertyType.residential);
  const [editExpectedUnits, setEditExpectedUnits] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const createProperty = trpc.properties.create.useMutation({
    onSuccess: (data) => {
      utils.properties.list.invalidate();
      setIsModalOpen(false);
      resetForm();
      setCreatedPropertyInfo({ id: data.id, name: data.name });
      setIsNudgeOpen(true);
    },
    onError: (err) => {
      setError(err.message || "Failed to create property. Please try again.");
    },
  });

  const updateProperty = trpc.properties.update.useMutation({
    onSuccess: () => {
      utils.properties.list.invalidate();
      setIsEditModalOpen(false);
      setPropertyToEdit(null);
      toast("Property updated", "success");
    },
    onError: (err) => {
      setEditError(err.message || "Failed to update property.");
    },
  });

  const deleteProperty = trpc.properties.delete.useMutation({
    onSuccess: () => {
      utils.properties.list.invalidate();
      setPropertyToDelete(null);
      toast("Property deleted", "success");
    },
    onError: (err) => {
      toast(err.message || "Failed to delete property.", "error");
      setPropertyToDelete(null);
    },
  });

  const resetForm = () => {
    setName("");
    setAddress("");
    setCity("");
    setState("");
    setPropertyType(PropertyType.residential);
    setExpectedUnits("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      await createProperty.mutateAsync({
        name,
        address,
        city,
        state,
        propertyType,
        expectedUnits: expectedUnits ? parseInt(expectedUnits, 10) : null,
      });
    } catch {
      // Handled by onError
    }
  };

  const handleOpenEdit = (property: NonNullable<typeof properties>[0]) => {
    setPropertyToEdit({
      id: property.id,
      name: property.name,
      address: property.address,
      city: property.city,
      state: property.state,
      propertyType: property.propertyType,
      expectedUnits: property.expectedUnits,
    });
    setEditName(property.name);
    setEditAddress(property.address);
    setEditCity(property.city);
    setEditState(property.state);
    setEditPropertyType(property.propertyType);
    setEditExpectedUnits(property.expectedUnits ? property.expectedUnits.toString() : "");
    setEditError(null);
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyToEdit) return;
    setEditError(null);

    try {
      await updateProperty.mutateAsync({
        id: propertyToEdit.id,
        name: editName,
        address: editAddress,
        city: editCity,
        state: editState,
        propertyType: editPropertyType,
        expectedUnits: editExpectedUnits ? parseInt(editExpectedUnits, 10) : null,
      });
    } catch {
      // Handled by onError
    }
  };

  const handleDeleteConfirm = async () => {
    if (!propertyToDelete) return;
    try {
      await deleteProperty.mutateAsync({ id: propertyToDelete.id });
    } catch {
      // Handled by onError
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white">
        <PageHeader title="Properties" />

        {/* Main Container */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Properties</h1>
              <p className="text-neutral-400 mt-1 text-sm">
                Manage your portfolio of residential, commercial, and mixed-use properties.
              </p>
            </div>
          </div>

          {/* Properties Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 backdrop-blur-sm space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <Skeleton className="h-6 w-36" />
                    <Skeleton className="h-4 w-48 mt-1" />
                  </div>
                  <Skeleton className="h-5 w-20 rounded-md" />
                </div>
                <div className="pt-4 border-t border-neutral-800/60 flex items-center justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-8 w-24 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <PageHeader
        title="Properties"
        actions={
          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-white text-neutral-950 hover:bg-neutral-200 font-semibold h-9 px-4 text-sm flex items-center"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Property
          </Button>
        }
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight">Your Properties</h1>
          <p className="text-neutral-400 text-sm">
            Manage your buildings, leasable units, and view active leases.
          </p>
        </div>

        {properties && properties.length > 0 ? (
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {properties.map((property) => (
              <div
                key={property.id}
                onClick={() => router.push(`/landlord/properties/${property.id}`)}
                className="group relative rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 hover:bg-neutral-900/60 hover:border-neutral-700 transition-all duration-200 backdrop-blur-sm flex flex-col justify-between cursor-pointer"
              >
                <div>
                  {/* Top row: Name on left, Tag & ⋯ menu right-aligned on same line */}
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-xl font-bold text-white group-hover:text-neutral-100 transition-colors break-words flex-1">
                      {property.name}
                    </h2>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-300 capitalize">
                        {property.propertyType}
                      </span>

                      {/* ⋯ Menu */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === property.id ? null : property.id);
                          }}
                          className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/80 transition-colors"
                          aria-label="Property options"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {openMenuId === property.id && (
                          <>
                            <div
                              className="fixed inset-0 z-30"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(null);
                              }}
                            />
                            <div className="absolute right-0 mt-1 w-40 rounded-xl border border-neutral-800 bg-neutral-950 p-1 shadow-2xl z-40 animate-in fade-in-0 zoom-in-95 duration-100">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(null);
                                  handleOpenEdit(property);
                                }}
                                className="w-full px-3 py-2 text-left text-xs rounded-lg text-neutral-300 hover:bg-neutral-900 hover:text-white flex items-center space-x-2 transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                <span>Edit property</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(null);
                                  setPropertyToDelete({ id: property.id, name: property.name });
                                }}
                                className="w-full px-3 py-2 text-left text-xs rounded-lg text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 flex items-center space-x-2 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete property</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-neutral-400 mt-2 line-clamp-2">
                    {property.address}, {property.city}, {property.state}
                  </p>
                </div>

                {/* Card stats: Total Units, Occupied Units, Vacant Units */}
                <div className="mt-6 pt-4 border-t border-neutral-800/60 flex items-center text-sm">
                  <div className="flex space-x-6">
                    <div>
                      <span className="block text-xs text-neutral-500 font-medium uppercase tracking-wider">Total Units</span>
                      <span className="text-base font-semibold text-neutral-200">{property.stats.totalUnits}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-neutral-500 font-medium uppercase tracking-wider">Occupied Units</span>
                      <span className="text-base font-semibold text-green-400">{property.stats.occupiedUnits}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-neutral-500 font-medium uppercase tracking-wider">Vacant Units</span>
                      <span className="text-base font-semibold text-yellow-400">{property.stats.vacantUnits}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-12 rounded-xl border border-neutral-800 bg-neutral-900/10 p-12 text-center max-w-xl mx-auto">
            <h3 className="text-lg font-medium text-white">No properties found</h3>
            <p className="text-neutral-400 text-sm mt-2">
              You haven&apos;t logged any properties yet. Add your first building to start managing leasable units.
            </p>
            <Button
              onClick={() => setIsModalOpen(true)}
              className="bg-white text-neutral-950 hover:bg-neutral-200 mt-6"
            >
              Add Your First Property
            </Button>
          </div>
        )}
      </main>

      {/* Add Property Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-8 shadow-2xl flex flex-col space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold tracking-tight">Add New Property</h2>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
                className="text-neutral-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label htmlFor="name" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Property Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                    placeholder="e.g. Alaba Plaza"
                  />
                </div>

                <div>
                  <label htmlFor="address" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Street Address
                  </label>
                  <input
                    id="address"
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                    placeholder="e.g. 15 Kingsway Road"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="state" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      State
                    </label>
                    <Select
                      id="state"
                      required
                      value={state}
                      onChange={(e) => {
                        setState(e.target.value);
                        setCity("");
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
                    <label htmlFor="city" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Local Government Area
                    </label>
                    <Select
                      id="city"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      disabled={!state}
                      className="mt-1"
                    >
                      <option value="">Select LGA</option>
                      {state &&
                        NIGERIA_LGAS[state as keyof typeof NIGERIA_LGAS]?.map((lga) => (
                          <option key={lga} value={lga}>
                            {lga}
                          </option>
                        ))}
                    </Select>
                  </div>
                </div>

                <div>
                  <label htmlFor="propertyType" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Property Type
                  </label>
                  <Select
                    id="propertyType"
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
                    <label htmlFor="expectedUnits" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Expected Number of Units
                    </label>
                    <input
                      id="expectedUnits"
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
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                  }}
                  variant="outline"
                  className="w-1/2 border-neutral-800 text-white hover:bg-neutral-900 h-10 text-sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createProperty.isPending}
                  className="w-1/2 bg-white text-neutral-950 hover:bg-neutral-200 h-10 text-sm"
                >
                  {createProperty.isPending ? "Creating..." : "Save Property"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Property Modal */}
      {isEditModalOpen && propertyToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-8 shadow-2xl flex flex-col space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold tracking-tight">Edit Property</h2>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setPropertyToEdit(null);
                }}
                className="text-neutral-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              {editError && (
                <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-3 text-sm text-red-400">
                  {editError}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label htmlFor="edit-name" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Property Name
                  </label>
                  <input
                    id="edit-name"
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
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
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
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
                      value={editState}
                      onChange={(e) => {
                        setEditState(e.target.value);
                        setEditCity("");
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
                      value={editCity}
                      onChange={(e) => setEditCity(e.target.value)}
                      disabled={!editState}
                      className="mt-1"
                    >
                      <option value="">Select LGA</option>
                      {editState &&
                        NIGERIA_LGAS[editState as keyof typeof NIGERIA_LGAS]?.map((lga) => (
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
                    value={editPropertyType}
                    onChange={(e) => setEditPropertyType(e.target.value as PropertyType)}
                    className="mt-1"
                  >
                    <option value={PropertyType.residential}>Residential</option>
                    <option value={PropertyType.commercial}>Commercial</option>
                    <option value={PropertyType.mixed}>Mixed-Use</option>
                  </Select>
                </div>

                {editPropertyType !== PropertyType.residential && (
                  <div>
                    <label htmlFor="edit-expectedUnits" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Expected Number of Units
                    </label>
                    <input
                      id="edit-expectedUnits"
                      type="number"
                      min="1"
                      value={editExpectedUnits}
                      onChange={(e) => setEditExpectedUnits(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-[38px]"
                    />
                  </div>
                )}
              </div>

              <div className="flex space-x-3 mt-6 pt-4 border-t border-neutral-800">
                <Button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setPropertyToEdit(null);
                  }}
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
        isOpen={Boolean(propertyToDelete)}
        onClose={() => setPropertyToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Property"
        description={
          propertyToDelete
            ? `Are you sure you want to delete "${propertyToDelete.name}"? This action cannot be undone.`
            : ""
        }
        confirmText={deleteProperty.isPending ? "Deleting..." : "Delete Property"}
        isLoading={deleteProperty.isPending}
      />

      {/* Property Onboarding Nudge Modal */}
      {isNudgeOpen && createdPropertyInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-2 font-sans">
              Property Created!
            </h2>
            <p className="text-sm text-neutral-400 mb-6 font-sans">
              Would you like to add units to <span className="text-white font-medium">{createdPropertyInfo.name}</span> now? You can generate multiple units at once using our bulk tools.
            </p>
            <div className="flex space-x-3">
              <Button
                onClick={() => {
                  setIsNudgeOpen(false);
                  router.push(`/landlord/properties/${createdPropertyInfo.id}`);
                }}
                variant="outline"
                className="w-1/2 border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-900 h-10 text-sm"
              >
                I&apos;ll do this later
              </Button>
              <Button
                onClick={() => {
                  setIsNudgeOpen(false);
                  router.push(`/landlord/properties/${createdPropertyInfo.id}?bulkAdd=true`);
                }}
                className="w-1/2 bg-white text-neutral-950 hover:bg-neutral-200 h-10 text-sm font-semibold"
              >
                Add Units
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
