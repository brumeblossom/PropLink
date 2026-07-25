'use client';

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { PropertyType, UnitType } from "@prisma/client";

export default function PropertyDetailPage() {
  const router = useRouter();
  const params = useParams();
  const propertyId = params.id as string;
  const utils = trpc.useUtils();

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

  // State
  const [isEditPropertyOpen, setIsEditPropertyOpen] = useState(false);
  const [isAddUnitOpen, setIsAddUnitOpen] = useState(false);

  // Property Form State
  const [propertyName, setPropertyName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [propertyCity, setPropertyCity] = useState("");
  const [propertyState, setPropertyState] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>(PropertyType.residential);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Unit Form State
  const [unitNumber, setUnitNumber] = useState("");
  const [unitType, setUnitType] = useState<UnitType>(UnitType.flat);
  const [sizeSqm, setSizeSqm] = useState("");
  const [unitError, setUnitError] = useState<string | null>(null);

  // Find current property
  const property = properties?.find((p) => p.id === propertyId);

  const handleOpenEdit = () => {
    if (property) {
      setPropertyName(property.name);
      setPropertyAddress(property.address);
      setPropertyCity(property.city);
      setPropertyState(property.state);
      setPropertyType(property.propertyType);
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
    setUnitType(UnitType.flat);
    setSizeSqm("");
    setUnitError(null);
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
          <div className="flex items-center space-x-4">
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
              className="bg-white text-neutral-950 hover:bg-neutral-200 h-9 px-4 text-sm"
            >
              Add Unit
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
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
                      Size (sqm)
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                      Current Tenant
                    </th>
                    <th scope="col" className="px-6 py-3.5 className=text-right text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                      Lease Range
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
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-neutral-400">
                        {unit.sizeSqm ? `${unit.sizeSqm} sqm` : "—"}
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/10 p-12 text-center">
              <p className="text-neutral-400 text-sm">This property has no units yet.</p>
              <Button
                onClick={() => setIsAddUnitOpen(true)}
                className="bg-white text-neutral-950 hover:bg-neutral-200 mt-4"
              >
                Add Your First Unit
              </Button>
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
                    <label htmlFor="edit-city" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      City
                    </label>
                    <input
                      id="edit-city"
                      type="text"
                      required
                      value={propertyCity}
                      onChange={(e) => setPropertyCity(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-state" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      State
                    </label>
                    <input
                      id="edit-state"
                      type="text"
                      required
                      value={propertyState}
                      onChange={(e) => setPropertyState(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                    />
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
                    onChange={(e) => setUnitType(e.target.value as UnitType)}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-[38px]"
                  >
                    <option value={UnitType.flat}>Flat / Apartment</option>
                    <option value={UnitType.shop}>Shop</option>
                    <option value={UnitType.office}>Office</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="sizeSqm" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Size in Square Meters (sqm, optional)
                  </label>
                  <input
                    id="sizeSqm"
                    type="number"
                    step="0.01"
                    value={sizeSqm}
                    onChange={(e) => setSizeSqm(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
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
                  {createUnit.isPending ? "Adding..." : "Add Unit"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
