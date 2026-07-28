'use client';

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { PropertyType } from "@prisma/client";
import { NIGERIA_STATES, NIGERIA_LGAS } from "@/utils/nigeriaGeo";

export default function PropertiesPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: properties, isLoading } = trpc.properties.list.useQuery();
  
  const [isNudgeOpen, setIsNudgeOpen] = useState(false);
  const [createdPropertyInfo, setCreatedPropertyInfo] = useState<{ id: string; name: string } | null>(null);

  const createProperty = trpc.properties.create.useMutation({
    onSuccess: (data) => {
      utils.properties.list.invalidate();
      setIsModalOpen(false);
      resetForm();
      setCreatedPropertyInfo({ id: data.id, name: data.name });
      setIsNudgeOpen(true);
    },
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>(PropertyType.residential);
  const [expectedUnits, setExpectedUnits] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create property. Please try again.";
      setError(message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-white">
        <p className="text-lg">Loading properties...</p>
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
            <span className="text-sm font-medium text-neutral-300">Properties</span>
          </div>
          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-white text-neutral-950 hover:bg-neutral-200 h-9 px-4 text-sm"
          >
            Add Property
          </Button>
        </div>
      </header>

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
              <Link
                key={property.id}
                href={`/landlord/properties/${property.id}`}
                className="group relative rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 hover:bg-neutral-900/50 hover:border-neutral-700 transition-all duration-300 backdrop-blur-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <h2 className="text-xl font-bold text-white group-hover:text-neutral-200 transition-colors">
                      {property.name}
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-300 capitalize">
                      {property.propertyType}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-400 mt-2 line-clamp-2">
                    {property.address}, {property.city}, {property.state}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-neutral-800/60 flex items-center justify-between text-sm">
                  <div className="flex space-x-4">
                    <div>
                      <span className="block text-xs text-neutral-500 font-medium uppercase tracking-wider">Total</span>
                      <span className="text-base font-semibold text-neutral-200">{property.stats.totalUnits}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-neutral-500 font-medium uppercase tracking-wider">Occupied</span>
                      <span className="text-base font-semibold text-green-400">{property.stats.occupiedUnits}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-neutral-500 font-medium uppercase tracking-wider">Vacant</span>
                      <span className="text-base font-semibold text-yellow-400">{property.stats.vacantUnits}</span>
                    </div>
                  </div>
                  <span className="text-xs text-neutral-400 group-hover:text-white transition-colors">
                    Manage &rarr;
                  </span>
                </div>
              </Link>
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
                    <select
                      id="state"
                      required
                      value={state}
                      onChange={(e) => {
                        setState(e.target.value);
                        setCity(""); // Reset LGA (city column) when state changes
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
                    <label htmlFor="city" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Local Government Area
                    </label>
                    <select
                      id="city"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      disabled={!state}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-[38px] disabled:opacity-50"
                    >
                      <option value="">Select LGA</option>
                      {state &&
                        NIGERIA_LGAS[state as keyof typeof NIGERIA_LGAS]?.map((lga) => (
                          <option key={lga} value={lga}>
                            {lga}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="propertyType" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Property Type
                  </label>
                  <select
                    id="propertyType"
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
