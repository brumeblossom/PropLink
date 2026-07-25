'use client';

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { PropertyType } from "@prisma/client";

export default function LandlordDashboard() {
  const router = useRouter();
  const { data: user, isLoading: isLoadingUser } = trpc.auth.me.useQuery();
  const { data: properties, isLoading: isLoadingProperties } = trpc.properties.list.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation();

  // Filters State
  const [propertyTypeFilter, setPropertyTypeFilter] = useState<string>("all");
  const [leaseStatusFilter, setLeaseStatusFilter] = useState<string>("all");

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  if (isLoadingUser || isLoadingProperties) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-white">
        <p className="text-lg">Loading dashboard...</p>
      </div>
    );
  }

  // Filter properties and units
  const filteredProperties = properties
    ?.map((property) => {
      // Filter by Property Type
      if (propertyTypeFilter !== "all" && property.propertyType !== propertyTypeFilter) {
        return null;
      }

      // Filter Units by Lease Status
      const filteredUnits = property.units.filter((unit) => {
        const isOccupied = unit.leases.length > 0;
        if (leaseStatusFilter === "occupied") return isOccupied;
        if (leaseStatusFilter === "vacant") return !isOccupied;
        return true;
      });

      // Only return property if it matches type and has units matching filter (or if no unit filter)
      if (leaseStatusFilter !== "all" && filteredUnits.length === 0) {
        return null;
      }

      return {
        ...property,
        units: filteredUnits,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  // Compute overall stats
  const totalProperties = properties?.length || 0;
  const totalUnitsCount = properties?.reduce((sum, p) => sum + p.units.length, 0) || 0;
  const occupiedUnitsCount = properties?.reduce((sum, p) => sum + p.units.filter(u => u.leases.length > 0).length, 0) || 0;
  const vacantUnitsCount = totalUnitsCount - occupiedUnitsCount;

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Navbar */}
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <span className="text-xl font-bold tracking-tight">PropLink</span>
            <nav className="hidden md:flex space-x-4 text-sm font-medium">
              <Link href="/landlord" className="text-white hover:text-neutral-300">
                Dashboard
              </Link>
              <Link href="/landlord/properties" className="text-neutral-400 hover:text-white transition-colors">
                Properties
              </Link>
            </nav>
          </div>

          <div className="flex items-center space-x-4">
            <span className="text-sm text-neutral-400 hidden sm:inline">
              {user?.email}
            </span>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="border-neutral-800 text-white hover:bg-neutral-900 text-sm h-9 px-4"
            >
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              Welcome back, {user?.fullName || "Landlord"}
            </h1>
            <p className="text-neutral-400 mt-1 text-sm">
              Overview of your leasable units and properties.
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex space-x-3">
            <Link href="/landlord/properties">
              <Button variant="outline" className="border-neutral-800 text-white hover:bg-neutral-900">
                Manage Properties
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 backdrop-blur-sm">
            <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Properties</span>
            <span className="text-3xl font-bold mt-2 block">{totalProperties}</span>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 backdrop-blur-sm">
            <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Total Units</span>
            <span className="text-3xl font-bold mt-2 block">{totalUnitsCount}</span>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 backdrop-blur-sm">
            <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Occupied</span>
            <span className="text-3xl font-bold mt-2 block text-green-400">{occupiedUnitsCount}</span>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 backdrop-blur-sm">
            <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Vacant</span>
            <span className="text-3xl font-bold mt-2 block text-yellow-400">{vacantUnitsCount}</span>
          </div>
        </div>

        {/* Filters Section */}
        <div className="mt-10 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border-b border-neutral-800 pb-6">
          <h2 className="text-xl font-bold tracking-tight">Leasable Units</h2>
          
          <div className="flex flex-wrap gap-3">
            {/* Property Type Filter */}
            <div className="flex items-center space-x-2">
              <span className="text-xs text-neutral-500 uppercase font-semibold">Type:</span>
              <select
                value={propertyTypeFilter}
                onChange={(e) => setPropertyTypeFilter(e.target.value)}
                className="bg-neutral-900 border border-neutral-800 rounded-lg text-xs px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-neutral-700"
              >
                <option value="all">All Types</option>
                <option value={PropertyType.residential}>Residential</option>
                <option value={PropertyType.commercial}>Commercial</option>
                <option value={PropertyType.mixed}>Mixed-Use</option>
              </select>
            </div>

            {/* Lease Status Filter */}
            <div className="flex items-center space-x-2">
              <span className="text-xs text-neutral-500 uppercase font-semibold">Status:</span>
              <select
                value={leaseStatusFilter}
                onChange={(e) => setLeaseStatusFilter(e.target.value)}
                className="bg-neutral-900 border border-neutral-800 rounded-lg text-xs px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-neutral-700"
              >
                <option value="all">All Statuses</option>
                <option value="occupied">Occupied</option>
                <option value="vacant">Vacant</option>
              </select>
            </div>
          </div>
        </div>

        {/* Segmented Dashboard Grid */}
        <div className="mt-8 space-y-10">
          {filteredProperties && filteredProperties.length > 0 ? (
            filteredProperties.map((property) => (
              <section key={property.id} className="space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-800/40 pb-2">
                  <div className="flex items-center space-x-3">
                    <h3 className="text-lg font-bold text-neutral-200">{property.name}</h3>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-neutral-900 border border-neutral-800 text-neutral-400 capitalize">
                      {property.propertyType}
                    </span>
                  </div>
                  <Link
                    href={`/landlord/properties/${property.id}`}
                    className="text-xs text-neutral-400 hover:text-white transition-colors"
                  >
                    View Property Detail &rarr;
                  </Link>
                </div>

                {property.units.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {property.units.map((unit) => {
                      const isOccupied = unit.leases.length > 0;
                      const activeLease = isOccupied ? unit.leases[0] : null;

                      return (
                        <div
                          key={unit.id}
                          className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-5 flex flex-col justify-between hover:border-neutral-700 transition-colors"
                        >
                          <div>
                            <div className="flex justify-between items-start">
                              <span className="font-bold text-white text-base">Unit {unit.unitNumber}</span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                  isOccupied
                                    ? "bg-green-950/30 text-green-400 border border-green-900/30"
                                    : "bg-yellow-950/30 text-yellow-400 border border-yellow-900/30"
                                }`}
                              >
                                {isOccupied ? "Occupied" : "Vacant"}
                              </span>
                            </div>
                            <span className="block text-xs text-neutral-500 capitalize mt-1">{unit.unitType}</span>
                          </div>

                          <div className="mt-6 pt-4 border-t border-neutral-800/40 space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-neutral-500">Tenant:</span>
                              <span className="font-medium text-neutral-300">
                                {activeLease?.tenant?.fullName || "—"}
                              </span>
                            </div>
                            {isOccupied && activeLease && (
                              <>
                                <div className="flex justify-between">
                                  <span className="text-neutral-500">Rent Due:</span>
                                  <span className="font-medium text-neutral-300">
                                    {/* Will be derived correctly in leaseLifeCycle prompts */}
                                    {new Date(activeLease.endDate).toLocaleDateString()}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500 py-2">No units match the filter criteria for this property.</p>
                )}
              </section>
            ))
          ) : (
            <div className="text-center py-12 rounded-xl border border-neutral-800 bg-neutral-900/10 max-w-md mx-auto">
              <p className="text-neutral-400 text-sm">No properties or units match your current filters.</p>
              {(propertyTypeFilter !== "all" || leaseStatusFilter !== "all") && (
                <Button
                  onClick={() => {
                    setPropertyTypeFilter("all");
                    setLeaseStatusFilter("all");
                  }}
                  variant="outline"
                  className="mt-4 border-neutral-800 text-xs h-8 px-3"
                >
                  Reset Filters
                </Button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
