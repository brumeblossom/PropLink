'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTitleRow } from "@/components/layout/PageTitleRow";
import { ActionMenu } from "@/components/ui/action-menu";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalField } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { PropertyType } from "@prisma/client";
import { NIGERIA_STATES, NIGERIA_LGAS } from "@/utils/nigeriaGeo";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export default function PropertiesPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const { data: properties, isLoading } = trpc.properties.list.useQuery();

  const [isNudgeOpen, setIsNudgeOpen] = useState(false);
  const [createdPropertyInfo, setCreatedPropertyInfo] = useState<{ id: string; name: string } | null>(null);

  // Card menu & modals state
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
      <div className="min-h-screen bg-background text-foreground">
        <PageHeader title="Properties" />

        {/* Main Container */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Properties</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Manage your portfolio of residential, commercial, and mixed-use properties.
              </p>
            </div>
          </div>

          {/* Properties Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card/30 p-6 backdrop-blur-sm space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <Skeleton className="h-6 w-36" />
                    <Skeleton className="h-4 w-48 mt-1" />
                  </div>
                  <Skeleton className="h-5 w-20 rounded-md" />
                </div>
                <div className="pt-4 border-t border-border/60 flex items-center justify-between">
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
    <div className="min-h-screen bg-background text-foreground">
      <PageHeader title="Properties" />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <PageTitleRow
          title="Your Properties"
          description="Manage your buildings, leasable units, and view active leases."
          actions={
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => setIsModalOpen(true)}
                  size="action"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center shrink-0"
                  aria-label="Add property"
                >
                  <Plus className="w-4 h-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">Add property</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" align="center" className="sm:hidden">
                Add property
              </TooltipContent>
            </Tooltip>
          }
        />

        {properties && properties.length > 0 ? (
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {properties.map((property) => (
              <div
                key={property.id}
                onClick={() => router.push(`/landlord/properties/${property.id}`)}
                className="group relative rounded-xl border border-border bg-card/40 p-6 hover:bg-card hover:border-border transition-all duration-200 backdrop-blur-sm flex flex-col justify-between cursor-pointer"
              >
                <div>
                  {/* Top row: Name on left, Tag & ⋯ menu right-aligned on same line */}
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-xl font-bold text-foreground transition-colors break-words flex-1">
                      {property.name}
                    </h2>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground capitalize">
                        {property.propertyType}
                      </span>

                      {/* ⋯ Menu */}
                      <ActionMenu
                        items={[
                          {
                            label: "Edit property",
                            icon: <Pencil className="w-3.5 h-3.5" />,
                            onClick: () => handleOpenEdit(property),
                          },
                          {
                            label: "Delete property",
                            icon: <Trash2 className="w-3.5 h-3.5" />,
                            variant: "danger",
                            onClick: () => setPropertyToDelete({ id: property.id, name: property.name }),
                          },
                        ]}
                        label="Property options"
                      />
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                    {property.address}, {property.city}, {property.state}
                  </p>
                </div>

                {/* Card stats: Total Units, Occupied Units, Vacant Units */}
                <div className="mt-6 pt-4 border-t border-border/60 flex items-center text-sm">
                  <div className="flex space-x-6">
                    <div>
                      <span className="block text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Units</span>
                      <span className="text-base font-semibold text-foreground">{property.stats.totalUnits}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-muted-foreground font-medium uppercase tracking-wider">Occupied Units</span>
                      <span className="text-base font-semibold text-success">{property.stats.occupiedUnits}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-muted-foreground font-medium uppercase tracking-wider">Vacant Units</span>
                      <span className="text-base font-semibold text-warning">{property.stats.vacantUnits}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-12 rounded-xl border border-border bg-card/20 p-12 text-center max-w-xl mx-auto">
            <h3 className="text-lg font-medium text-foreground">No properties found</h3>
            <p className="text-muted-foreground text-sm mt-2">
              You haven&apos;t logged any properties yet. Add your first building to start managing leasable units.
            </p>
            <Button
              onClick={() => setIsModalOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 mt-6"
            >
              Add Your First Property
            </Button>
          </div>
        )}
      </main>

      {/* Add Property Modal */}
      <Modal
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) resetForm();
        }}
        size="md"
        isSaving={createProperty.isPending}
      >
        <ModalHeader
          title="Add property"
          onClose={() => {
            setIsModalOpen(false);
            resetForm();
          }}
          isSaving={createProperty.isPending}
        />
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <ModalBody>
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive-tint/20 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <ModalField label="Property Name" htmlFor="name" required>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-sm"
                placeholder="e.g. Alaba Plaza"
              />
            </ModalField>

            <ModalField label="Street Address" htmlFor="address" required>
              <input
                id="address"
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-sm"
                placeholder="e.g. 15 Kingsway Road"
              />
            </ModalField>

            <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-4">
              <ModalField label="State" htmlFor="state" required>
                <Select
                  id="state"
                  required
                  value={state}
                  onChange={(e) => {
                    setState(e.target.value);
                    setCity("");
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
              <ModalField label="Local Government Area" htmlFor="city" required>
                <Select
                  id="city"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={!state}
                  className="h-12"
                >
                  <option value="">Select LGA</option>
                  {state &&
                    NIGERIA_LGAS[state as keyof typeof NIGERIA_LGAS]?.map((lga) => (
                      <option key={lga} value={lga}>
                        {lga}
                      </option>
                    ))}
                </Select>
              </ModalField>
            </div>

            <ModalField label="Property Type" htmlFor="propertyType">
              <Select
                id="propertyType"
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
              <ModalField label="Expected Number of Units" htmlFor="expectedUnits">
                <input
                  id="expectedUnits"
                  type="number"
                  min="1"
                  value={expectedUnits}
                  onChange={(e) => setExpectedUnits(e.target.value)}
                  placeholder="e.g. 20"
                  className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-sm"
                />
              </ModalField>
            )}
          </ModalBody>

          <ModalFooter>
            <div className="grid grid-cols-2 gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
                disabled={createProperty.isPending}
                className="w-full h-12 rounded-lg text-[15px] font-semibold border-border hover:bg-muted"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createProperty.isPending}
                className="w-full h-12 rounded-lg text-[15px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2"
              >
                {createProperty.isPending && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                Save property
              </Button>
            </div>
          </ModalFooter>
        </form>
      </Modal>

      {/* Edit Property Modal */}
      <Modal
        open={isEditModalOpen && Boolean(propertyToEdit)}
        onOpenChange={(open) => {
          setIsEditModalOpen(open);
          if (!open) setPropertyToEdit(null);
        }}
        size="md"
        isSaving={updateProperty.isPending}
      >
        <ModalHeader
          title="Edit property"
          onClose={() => {
            setIsEditModalOpen(false);
            setPropertyToEdit(null);
          }}
          isSaving={updateProperty.isPending}
        />
        <form onSubmit={handleEditSubmit} className="flex-1 flex flex-col min-h-0">
          <ModalBody>
            {editError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive-tint/20 p-3 text-sm text-destructive">
                {editError}
              </div>
            )}

            <ModalField label="Property Name" htmlFor="edit-name" required>
              <input
                id="edit-name"
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-sm"
              />
            </ModalField>

            <ModalField label="Street Address" htmlFor="edit-address" required>
              <input
                id="edit-address"
                type="text"
                required
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
                className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-sm"
              />
            </ModalField>

            <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-4">
              <ModalField label="State" htmlFor="edit-state" required>
                <Select
                  id="edit-state"
                  required
                  value={editState}
                  onChange={(e) => {
                    setEditState(e.target.value);
                    setEditCity("");
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
                  value={editCity}
                  onChange={(e) => setEditCity(e.target.value)}
                  disabled={!editState}
                  className="h-12"
                >
                  <option value="">Select LGA</option>
                  {editState &&
                    NIGERIA_LGAS[editState as keyof typeof NIGERIA_LGAS]?.map((lga) => (
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
                value={editPropertyType}
                onChange={(e) => setEditPropertyType(e.target.value as PropertyType)}
                className="h-12"
              >
                <option value={PropertyType.residential}>Residential</option>
                <option value={PropertyType.commercial}>Commercial</option>
                <option value={PropertyType.mixed}>Mixed-Use</option>
              </Select>
            </ModalField>

            {editPropertyType !== PropertyType.residential && (
              <ModalField label="Expected Number of Units" htmlFor="edit-expectedUnits">
                <input
                  id="edit-expectedUnits"
                  type="number"
                  min="1"
                  value={editExpectedUnits}
                  onChange={(e) => setEditExpectedUnits(e.target.value)}
                  className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-sm"
                />
              </ModalField>
            )}
          </ModalBody>

          <ModalFooter>
            <div className="grid grid-cols-2 gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setPropertyToEdit(null);
                }}
                disabled={updateProperty.isPending}
                className="w-full h-12 rounded-lg text-[15px] font-semibold border-border hover:bg-muted"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateProperty.isPending}
                className="w-full h-12 rounded-lg text-[15px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2"
              >
                {updateProperty.isPending && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                Save changes
              </Button>
            </div>
          </ModalFooter>
        </form>
      </Modal>

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
      <Modal
        open={isNudgeOpen && Boolean(createdPropertyInfo)}
        onOpenChange={setIsNudgeOpen}
        size="sm"
      >
        <ModalHeader
          title="Property created"
          onClose={() => setIsNudgeOpen(false)}
        />
        <ModalBody>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Would you like to add units to <span className="text-foreground font-semibold">{createdPropertyInfo?.name}</span> now? You can generate multiple units at once using our bulk tools.
          </p>
        </ModalBody>
        <ModalFooter>
          <div className="grid grid-cols-2 gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsNudgeOpen(false);
                if (createdPropertyInfo) {
                  router.push(`/landlord/properties/${createdPropertyInfo.id}`);
                }
              }}
              className="w-full h-12 rounded-lg text-[15px] font-semibold border-border hover:bg-muted"
            >
              Later
            </Button>
            <Button
              type="button"
              onClick={() => {
                setIsNudgeOpen(false);
                if (createdPropertyInfo) {
                  router.push(`/landlord/properties/${createdPropertyInfo.id}?bulkAdd=true`);
                }
              }}
              className="w-full h-12 rounded-lg text-[15px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Add units
            </Button>
          </div>
        </ModalFooter>
      </Modal>
    </div>
  );
}
