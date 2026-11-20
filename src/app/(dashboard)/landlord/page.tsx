'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { trpc } from "@/utils/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency } from "@/lib/utils";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

const PROPERTY_TYPE_COLORS: Record<string, string> = {
  residential: "#3b82f6", // blue-500
  commercial: "#a855f7", // purple-500
  mixed: "#06b6d4", // cyan-500
};

export default function LandlordDashboard() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Single tRPC request for all dashboard metrics, charts, lists, and properties
  const { data: summary, isLoading: isLoadingSummary } = trpc.dashboard.landlordSummary.useQuery();
  const { data: user } = trpc.auth.me.useQuery();

  if (isLoadingSummary) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white">
        <PageHeader title="Dashboard" />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
          <div>
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-4 w-72 mt-2" />
          </div>

          {/* Stats Skeletons */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-16 mt-3" />
                {i === 2 && <Skeleton className="h-3 w-24 mt-2" />}
              </div>
            ))}
          </div>

          {/* Grid Skeletons */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 h-72">
                <Skeleton className="h-5 w-40 mb-4" />
                <Skeleton className="h-48 w-full rounded-lg" />
              </div>
            ))}
          </div>

          {/* Table Skeleton */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6">
            <Skeleton className="h-6 w-36 mb-4" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        </main>
      </div>
    );
  }

  const stats = summary?.stats || {
    totalProperties: 0,
    totalUnits: 0,
    occupiedUnits: 0,
    vacantUnits: 0,
    occupancyRate: 0,
  };

  const propertiesByType = summary?.propertiesByType || [];
  const totalTypedProperties = propertiesByType.reduce((sum, item) => sum + item.count, 0);

  const unitsByType = summary?.unitsByType || [];
  const occupancyByProperty = summary?.occupancyByProperty || [];
  const tenantsByLocation = summary?.tenantsByLocation || { level: "state", data: [] };
  const leasesEndingSoon = summary?.leasesEndingSoon || [];
  const pendingPayments = summary?.pendingPayments || { count: 0, items: [] };
  const propertiesTable = summary?.propertiesTable || [];

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <PageHeader title="Dashboard" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Welcome Section */}
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Welcome back, {user?.fullName || "Landlord"}
          </h1>
          <p className="text-neutral-400 mt-1 text-sm">
            Overview of your properties, units, and tenant activity.
          </p>
        </div>

        {/* 4 Stat Cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 backdrop-blur-sm">
            <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Properties</span>
            <span className="text-3xl font-bold mt-2 block">{stats.totalProperties}</span>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 backdrop-blur-sm">
            <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Total Units</span>
            <span className="text-3xl font-bold mt-2 block">{stats.totalUnits}</span>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 backdrop-blur-sm">
            <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Occupied</span>
            <span className="text-3xl font-bold mt-2 block text-green-400">{stats.occupiedUnits}</span>
            <span className="text-xs text-neutral-400 mt-1 block">{stats.occupancyRate}% occupancy</span>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 backdrop-blur-sm">
            <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Vacant</span>
            <span className="text-3xl font-bold mt-2 block text-neutral-300">{stats.vacantUnits}</span>
          </div>
        </div>

        {/* Responsive Grid: 2 columns on desktop, 1 on phones */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 1. Properties by type: Donut chart */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Properties by Type</h2>
              <p className="text-xs text-neutral-400 mt-0.5">Distribution across residential, commercial, and mixed-use</p>
            </div>

            <div className="h-60 w-full mt-4 flex items-center justify-center">
              {totalTypedProperties === 0 ? (
                <div className="text-center text-sm text-neutral-500">No properties added yet.</div>
              ) : isMounted ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={propertiesByType}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {propertiesByType.map((entry) => (
                        <Cell
                          key={`cell-${entry.type}`}
                          fill={PROPERTY_TYPE_COLORS[entry.type] || "#737373"}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#171717",
                        borderColor: "#262626",
                        borderRadius: "0.5rem",
                        color: "#fff",
                        fontSize: "0.75rem",
                      }}
                      itemStyle={{ color: "#e5e5e5" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : null}
            </div>

            {/* Custom Legend with counts */}
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2 border-t border-neutral-800/40">
              {propertiesByType.map((item) => (
                <div key={item.type} className="flex items-center space-x-2 text-xs">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: PROPERTY_TYPE_COLORS[item.type] || "#737373" }}
                  />
                  <span className="text-neutral-300">
                    {item.label}: <strong className="text-white">{item.count}</strong>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Units by unit type: Horizontal bar chart */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Units by Unit Type</h2>
              <p className="text-xs text-neutral-400 mt-0.5">Breakdown of unit categories across your properties</p>
            </div>

            <div className="h-64 w-full mt-4 flex items-center justify-center">
              {unitsByType.length === 0 ? (
                <div className="text-center text-sm text-neutral-500">No units found.</div>
              ) : isMounted ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={unitsByType}
                    margin={{ top: 10, right: 20, left: 20, bottom: 0 }}
                  >
                    <XAxis type="number" allowDecimals={false} tick={{ fill: "#a3a3a3", fontSize: 11 }} />
                    <YAxis
                      dataKey="type"
                      type="category"
                      width={100}
                      tick={{ fill: "#d4d4d4", fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#171717",
                        borderColor: "#262626",
                        borderRadius: "0.5rem",
                        color: "#fff",
                        fontSize: "0.75rem",
                      }}
                      itemStyle={{ color: "#e5e5e5" }}
                    />
                    <Bar dataKey="count" name="Units" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </div>

          {/* 3. Occupancy by property: Horizontal stacked bar */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Occupancy by Property</h2>
              <p className="text-xs text-neutral-400 mt-0.5">Occupied vs vacant units per property</p>
            </div>

            <div className="h-64 w-full mt-4 flex items-center justify-center">
              {occupancyByProperty.length === 0 ? (
                <div className="text-center text-sm text-neutral-500">No properties available.</div>
              ) : isMounted ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={occupancyByProperty}
                    margin={{ top: 10, right: 20, left: 20, bottom: 0 }}
                  >
                    <XAxis type="number" allowDecimals={false} tick={{ fill: "#a3a3a3", fontSize: 11 }} />
                    <YAxis
                      dataKey="propertyName"
                      type="category"
                      width={120}
                      tick={{ fill: "#d4d4d4", fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#171717",
                        borderColor: "#262626",
                        borderRadius: "0.5rem",
                        color: "#fff",
                        fontSize: "0.75rem",
                      }}
                      itemStyle={{ color: "#e5e5e5" }}
                    />
                    <Bar dataKey="occupied" stackId="occupancy" name="Occupied" fill="#22c55e" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="vacant" stackId="occupancy" name="Vacant" fill="#525252" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : null}
            </div>

            {/* Legend for Occupied vs Vacant */}
            <div className="flex items-center justify-center space-x-6 pt-2 border-t border-neutral-800/40">
              <div className="flex items-center space-x-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="text-neutral-300">Occupied</span>
              </div>
              <div className="flex items-center space-x-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-neutral-600" />
                <span className="text-neutral-300">Vacant</span>
              </div>
            </div>
          </div>

          {/* 4. Tenants by location: Bar chart */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">
                Tenants by {tenantsByLocation.level === "city" ? "City" : "State"}
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Active tenant count grouped by {tenantsByLocation.level === "city" ? "city" : "state"}
              </p>
            </div>

            <div className="h-64 w-full mt-4 flex items-center justify-center">
              {tenantsByLocation.data.length === 0 ? (
                <div className="text-center text-sm text-neutral-500">No active tenants.</div>
              ) : isMounted ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={tenantsByLocation.data}
                    margin={{ top: 10, right: 20, left: 20, bottom: 0 }}
                  >
                    <XAxis type="number" allowDecimals={false} tick={{ fill: "#a3a3a3", fontSize: 11 }} />
                    <YAxis
                      dataKey="location"
                      type="category"
                      width={100}
                      tick={{ fill: "#d4d4d4", fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#171717",
                        borderColor: "#262626",
                        borderRadius: "0.5rem",
                        color: "#fff",
                        fontSize: "0.75rem",
                      }}
                      itemStyle={{ color: "#e5e5e5" }}
                    />
                    <Bar dataKey="count" name="Tenants" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </div>

          {/* 5. Leases ending soon */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Leases Ending Soon</h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Leases up for renewal or expiring within the next 60 days
              </p>
            </div>

            <div className="mt-4 flex-1">
              {leasesEndingSoon.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-center text-sm text-neutral-500">
                  No leases ending in the next 60 days.
                </div>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {leasesEndingSoon.map((lease) => (
                    <Link
                      key={lease.leaseId}
                      href={`/landlord/properties/${lease.propertyId}/units/${lease.unitId}`}
                      className="block p-3 rounded-lg border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900 hover:border-neutral-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">{lease.tenantName}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            lease.daysLeft <= 14
                              ? "bg-red-950/30 text-red-400 border-red-900/30"
                              : "bg-amber-950/30 text-amber-400 border-amber-900/30"
                          }`}
                        >
                          {lease.daysLeft === 0
                            ? "Expires today"
                            : lease.daysLeft === 1
                            ? "Expires tomorrow"
                            : `Expires in ${lease.daysLeft} days`}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-neutral-400">
                        <span>
                          Unit {lease.unitNumber} · {lease.propertyName}
                        </span>
                        <span>Ends {lease.endDate}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 6. Payments waiting for you */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Payments Waiting for You</h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Tenant-logged payments awaiting your confirmation
                </p>
              </div>
              {pendingPayments.count > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {pendingPayments.count}
                </span>
              )}
            </div>

            <div className="mt-4 flex-1">
              {pendingPayments.items.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-center text-sm text-neutral-500">
                  Nothing to confirm.
                </div>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {pendingPayments.items.map((p) => (
                    <Link
                      key={p.paymentId}
                      href={`/landlord/properties/${p.propertyId}/units/${p.unitId}?paymentId=${p.paymentId}`}
                      className="block p-3 rounded-lg border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900 hover:border-neutral-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">{p.tenantName}</span>
                        <span className="text-sm font-bold text-green-400">{formatCurrency(p.amount)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-neutral-400">
                        <span>
                          Unit {p.unitNumber} · {p.propertyName}
                        </span>
                        <span>Paid {p.date}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Properties Table Section */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">All Properties</h2>
            <span className="text-xs text-neutral-400">{propertiesTable.length} properties</span>
          </div>

          {propertiesTable.length === 0 ? (
            <div className="py-10 text-center text-sm text-neutral-500">No properties added yet.</div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-800 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Location</th>
                      <th className="py-3 px-4 text-center">Units</th>
                      <th className="py-3 px-4 text-center">Occupied</th>
                      <th className="py-3 px-4 text-center">Vacant</th>
                      <th className="py-3 px-4 text-right">Occupancy %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {propertiesTable.map((p) => (
                      <tr
                        key={p.id}
                        className="hover:bg-neutral-900/60 transition-colors group cursor-pointer"
                      >
                        <td className="py-3.5 px-4 font-semibold text-white">
                          <Link href={`/landlord/properties/${p.id}`} className="hover:underline block">
                            {p.name}
                          </Link>
                        </td>
                        <td className="py-3.5 px-4 capitalize text-neutral-300">
                          <Link href={`/landlord/properties/${p.id}`} className="block">
                            {p.propertyType}
                          </Link>
                        </td>
                        <td className="py-3.5 px-4 text-neutral-300">
                          <Link href={`/landlord/properties/${p.id}`} className="block">
                            {p.city}, {p.state}
                          </Link>
                        </td>
                        <td className="py-3.5 px-4 text-center text-neutral-200">
                          <Link href={`/landlord/properties/${p.id}`} className="block">
                            {p.totalUnits}
                          </Link>
                        </td>
                        <td className="py-3.5 px-4 text-center font-medium text-green-400">
                          <Link href={`/landlord/properties/${p.id}`} className="block">
                            {p.occupiedUnits}
                          </Link>
                        </td>
                        <td className="py-3.5 px-4 text-center text-neutral-300">
                          <Link href={`/landlord/properties/${p.id}`} className="block">
                            {p.vacantUnits}
                          </Link>
                        </td>
                        <td className="py-3.5 px-4 text-right font-semibold text-white">
                          <Link href={`/landlord/properties/${p.id}`} className="block">
                            {p.occupancyRate}%
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-3">
                {propertiesTable.map((p) => (
                  <Link
                    key={p.id}
                    href={`/landlord/properties/${p.id}`}
                    className="block p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white text-base">{p.name}</span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-neutral-900 border border-neutral-800 text-neutral-400 capitalize">
                        {p.propertyType}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">
                      {p.city}, {p.state}
                    </p>

                    <div className="mt-4 pt-3 border-t border-neutral-800/60 grid grid-cols-4 gap-2 text-center text-xs">
                      <div>
                        <span className="block text-neutral-500 text-[10px] uppercase">Units</span>
                        <span className="font-bold text-white mt-0.5 block">{p.totalUnits}</span>
                      </div>
                      <div>
                        <span className="block text-neutral-500 text-[10px] uppercase">Occupied</span>
                        <span className="font-bold text-green-400 mt-0.5 block">{p.occupiedUnits}</span>
                      </div>
                      <div>
                        <span className="block text-neutral-500 text-[10px] uppercase">Vacant</span>
                        <span className="font-bold text-neutral-300 mt-0.5 block">{p.vacantUnits}</span>
                      </div>
                      <div>
                        <span className="block text-neutral-500 text-[10px] uppercase">Rate</span>
                        <span className="font-bold text-white mt-0.5 block">{p.occupancyRate}%</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
