'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { trpc } from "@/utils/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency } from "@/lib/utils";
import {
  Building2,
  LayoutGrid,
  UserCheck,
  DoorOpen,
} from "lucide-react";
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
  CartesianGrid,
} from "recharts";

// Brand KPI series colors for charts
const DONUT_COLORS: Record<string, string> = {
  residential: "hsl(var(--kpi-navy))",
  commercial: "hsl(var(--kpi-gold))",
  mixed: "hsl(var(--kpi-sage))",
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
      <div className="min-h-screen bg-background text-foreground">
        <PageHeader title="Dashboard" />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <div>
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-64 mt-1.5" />
          </div>

          {/* Stats Skeletons (4 across desktop, 2 across mobile) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-[18px] min-h-[140px] flex flex-col justify-between">
                <Skeleton className="w-10 h-10 rounded-xl" />
                <div className="space-y-1.5 mt-3.5">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-7 w-16" />
                </div>
              </div>
            ))}
          </div>

          {/* Grid Skeletons */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-5 h-[264px]">
                <Skeleton className="h-4 w-36 mb-4" />
                <Skeleton className="h-[180px] w-full rounded-lg" />
              </div>
            ))}
          </div>

          {/* Table Skeleton */}
          <div className="rounded-xl border border-border bg-card p-5">
            <Skeleton className="h-4 w-32 mb-4" />
            <Skeleton className="h-44 w-full rounded-lg" />
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

  // Dynamic height calculation: charts with 1-3 rows shrink to rows * 32px + 24px (min 120px)
  const getChartHeight = (rowsCount: number) => {
    if (rowsCount <= 0) return 200;
    if (rowsCount <= 3) return Math.max(120, rowsCount * 32 + 24);
    return 200;
  };

  // Calculate dynamic label width clamped to max 120px
  const getYAxisWidth = (labels: string[]) => {
    if (labels.length === 0) return 70;
    const maxLen = Math.max(...labels.map((l) => l.length));
    return Math.min(120, Math.max(70, maxLen * 7.5));
  };

  const unitsYWidth = getYAxisWidth(unitsByType.map((u) => u.type));
  const occupancyYWidth = getYAxisWidth(occupancyByProperty.map((p) => p.propertyName));
  const tenantsYWidth = getYAxisWidth(tenantsByLocation.data.map((t) => t.location));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageHeader title="Dashboard" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Welcome Section */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground font-sans">
            Welcome back, {user?.fullName || "Landlord"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Overview of your properties, units, and tenant activity.
          </p>
        </div>

        {/* 1. Stat Cards: 4 across desktop, 2 across mobile */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
          {/* Card 1: Total properties (kpi-navy, Building2) */}
          <div className="rounded-xl px-[18px] py-4 border border-transparent bg-kpi-navy-fill flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-white/80 dark:bg-black/25 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-kpi-navy" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-muted-foreground leading-none">Total properties</span>
              <span className="text-2xl font-bold tracking-tight tabular-nums text-foreground mt-0.5 block leading-tight">
                {stats.totalProperties}
              </span>
            </div>
          </div>

          {/* Card 2: Total units (kpi-gold, LayoutGrid) */}
          <div className="rounded-xl px-[18px] py-4 border border-transparent bg-kpi-gold-fill flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-white/80 dark:bg-black/25 flex items-center justify-center shrink-0">
              <LayoutGrid className="w-5 h-5 text-kpi-gold" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-muted-foreground leading-none">Total units</span>
              <span className="text-2xl font-bold tracking-tight tabular-nums text-foreground mt-0.5 block leading-tight">
                {stats.totalUnits}
              </span>
            </div>
          </div>

          {/* Card 3: Occupied (kpi-sage, UserCheck) */}
          <div className="rounded-xl px-[18px] py-4 border border-transparent bg-kpi-sage-fill flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-white/80 dark:bg-black/25 flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5 text-kpi-sage" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-muted-foreground leading-none">Occupied</span>
              <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-baseline mt-0.5">
                <span className="text-2xl font-bold tracking-tight tabular-nums text-foreground leading-tight">
                  {stats.occupiedUnits}
                </span>
                <span className="text-xs text-subtle-foreground min-[380px]:ml-2">
                  {stats.occupancyRate}% occupancy
                </span>
              </div>
            </div>
          </div>

          {/* Card 4: Vacant (kpi-clay, DoorOpen) */}
          <div className="rounded-xl px-[18px] py-4 border border-transparent bg-kpi-clay-fill flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-white/80 dark:bg-black/25 flex items-center justify-center shrink-0">
              <DoorOpen className="w-5 h-5 text-kpi-clay" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-muted-foreground leading-none">Vacant</span>
              <span className="text-2xl font-bold tracking-tight tabular-nums text-foreground mt-0.5 block leading-tight">
                {stats.vacantUnits}
              </span>
            </div>
          </div>
        </div>

        {/* 2 & 3. Responsive Grid: 2 columns on desktop, 1 on phones with 16px gap */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Chart 1: Properties by Type (Donut) */}
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between">
            <h2 className="text-sm font-semibold text-foreground mb-4">Properties by Type</h2>

            <div className="h-[200px] w-full flex items-center justify-center">
              {totalTypedProperties === 0 ? (
                <div className="text-center text-xs text-muted-foreground">No properties added yet.</div>
              ) : isMounted ? (
                <div className="w-full h-full flex flex-col sm:flex-row items-center justify-center gap-6">
                  <div className="w-[180px] h-[180px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={propertiesByType}
                          dataKey="count"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          innerRadius={56}
                          outerRadius={76}
                          paddingAngle={2}
                        >
                          {propertiesByType.map((entry) => (
                            <Cell
                              key={`cell-${entry.type}`}
                              fill={DONUT_COLORS[entry.type] || "hsl(var(--kpi-navy))"}
                              stroke="hsl(var(--card))"
                              strokeWidth={1}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            borderColor: "hsl(var(--border))",
                            borderRadius: "8px",
                            fontSize: "12px",
                            color: "hsl(var(--foreground))",
                          }}
                          itemStyle={{ color: "hsl(var(--foreground))" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Legend */}
                  <div className="flex flex-col gap-2">
                    {propertiesByType.map((item) => (
                      <div key={item.type} className="flex items-center text-xs text-muted-foreground">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 mr-2"
                          style={{ backgroundColor: DONUT_COLORS[item.type] || "hsl(var(--kpi-navy))" }}
                        />
                        <span>{item.label}</span>
                        <span className="text-foreground font-medium ml-1.5">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Chart 2: Units by Unit Type (Horizontal Bar) */}
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between">
            <h2 className="text-sm font-semibold text-foreground mb-4">Units by Unit Type</h2>

            <div
              style={{ height: getChartHeight(unitsByType.length) }}
              className="w-full flex items-center justify-center transition-all"
            >
              {unitsByType.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground">No units found.</div>
              ) : isMounted ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={unitsByType}
                    barCategoryGap="35%"
                    margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid horizontal={false} vertical={true} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <YAxis
                      dataKey="type"
                      type="category"
                      axisLine={false}
                      tickLine={false}
                      width={unitsYWidth}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                      tickFormatter={(v) => (v && v.length > 14 ? `${v.slice(0, 13)}…` : v)}
                    />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted) / 0.5)" }}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        borderColor: "hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                        color: "hsl(var(--foreground))",
                      }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Bar
                      dataKey="count"
                      name="Units"
                      fill="hsl(var(--kpi-navy))"
                      barSize={14}
                      maxBarSize={14}
                      radius={[0, 3, 3, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </div>

          {/* Chart 3: Occupancy by Property (Stacked Horizontal Bar) */}
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Occupancy by Property</h2>
              <div className="flex items-center space-x-3 text-xs text-muted-foreground">
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "hsl(var(--kpi-sage))" }} />
                  <span>Occupied</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "hsl(var(--border))" }} />
                  <span>Vacant</span>
                </div>
              </div>
            </div>

            <div
              style={{ height: getChartHeight(occupancyByProperty.length) }}
              className="w-full flex items-center justify-center transition-all"
            >
              {occupancyByProperty.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground">No properties available.</div>
              ) : isMounted ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={occupancyByProperty}
                    barCategoryGap="35%"
                    margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid horizontal={false} vertical={true} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <YAxis
                      dataKey="propertyName"
                      type="category"
                      axisLine={false}
                      tickLine={false}
                      width={occupancyYWidth}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                      tickFormatter={(v) => (v && v.length > 14 ? `${v.slice(0, 13)}…` : v)}
                    />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted) / 0.5)" }}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        borderColor: "hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                        color: "hsl(var(--foreground))",
                      }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Bar
                      dataKey="occupied"
                      stackId="occupancy"
                      name="Occupied"
                      fill="hsl(var(--kpi-sage))"
                      barSize={14}
                      maxBarSize={14}
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="vacant"
                      stackId="occupancy"
                      name="Vacant"
                      fill="hsl(var(--border))"
                      barSize={14}
                      maxBarSize={14}
                      radius={[0, 3, 3, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </div>

          {/* Chart 4: Tenants by Location (Horizontal Bar) */}
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between">
            <h2 className="text-sm font-semibold text-foreground mb-4">
              Tenants by {tenantsByLocation.level === "city" ? "City" : "State"}
            </h2>

            <div
              style={{ height: getChartHeight(tenantsByLocation.data.length) }}
              className="w-full flex items-center justify-center transition-all"
            >
              {tenantsByLocation.data.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground">No active tenants.</div>
              ) : isMounted ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={tenantsByLocation.data}
                    barCategoryGap="35%"
                    margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid horizontal={false} vertical={true} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <YAxis
                      dataKey="location"
                      type="category"
                      axisLine={false}
                      tickLine={false}
                      width={tenantsYWidth}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                      tickFormatter={(v) => (v && v.length > 14 ? `${v.slice(0, 13)}…` : v)}
                    />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted) / 0.5)" }}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        borderColor: "hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                        color: "hsl(var(--foreground))",
                      }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Bar
                      dataKey="count"
                      name="Tenants"
                      fill="hsl(var(--kpi-gold))"
                      barSize={14}
                      maxBarSize={14}
                      radius={[0, 3, 3, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </div>

          {/* List 1: Leases Ending Soon */}
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Leases Ending Soon</h2>

              <div className="mt-3">
                {leasesEndingSoon.length === 0 ? (
                  <div className="h-[120px] flex items-center justify-center text-xs text-muted-foreground">
                    No leases ending in the next 60 days.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {leasesEndingSoon.slice(0, 5).map((lease) => (
                      <Link
                        key={lease.leaseId}
                        href={`/landlord/properties/${lease.propertyId}/units/${lease.unitId}`}
                        className="h-[44px] flex items-center justify-between px-1 hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex items-center space-x-2 min-w-0 pr-3">
                          <span className="text-sm font-medium text-foreground truncate group-hover:underline">
                            {lease.tenantName}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            · Unit {lease.unitNumber}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {lease.daysLeft === 0
                            ? "Expires today"
                            : lease.daysLeft === 1
                            ? "Expires tomorrow"
                            : `in ${lease.daysLeft}d`}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {leasesEndingSoon.length > 0 && (
              <div className="flex justify-end pt-3 border-t border-border mt-1">
                <Link
                  href="/landlord/tenants"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  View all &rarr;
                </Link>
              </div>
            )}
          </div>

          {/* List 2: Payments Waiting for You */}
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Payments Waiting for You</h2>
                {pendingPayments.count > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-warning-tint text-warning border border-warning/30">
                    {pendingPayments.count}
                  </span>
                )}
              </div>

              <div className="mt-3">
                {pendingPayments.items.length === 0 ? (
                  <div className="h-[120px] flex items-center justify-center text-xs text-muted-foreground">
                    Nothing to confirm.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {pendingPayments.items.slice(0, 5).map((p) => (
                      <Link
                        key={p.paymentId}
                        href={`/landlord/properties/${p.propertyId}/units/${p.unitId}?paymentId=${p.paymentId}`}
                        className="h-[44px] flex items-center justify-between px-1 hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex items-center space-x-2 min-w-0 pr-3">
                          <span className="text-sm font-medium text-foreground truncate group-hover:underline">
                            {p.tenantName}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            · Unit {p.unitNumber}
                          </span>
                        </div>
                        <div className="flex items-center space-x-3 shrink-0">
                          <span className="text-sm font-medium text-foreground">{formatCurrency(p.amount)}</span>
                          <span className="text-xs text-muted-foreground">{p.date}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {pendingPayments.items.length > 0 && (
              <div className="flex justify-end pt-3 border-t border-border mt-1">
                <Link
                  href="/landlord/properties"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  View all &rarr;
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* 4. All Properties Table */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">All Properties</h2>
            <span className="text-xs text-muted-foreground">{propertiesTable.length} properties</span>
          </div>

          {propertiesTable.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">No properties added yet.</div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted text-xs font-medium text-subtle-foreground uppercase tracking-wider">
                      <th className="py-2.5 px-4">Name</th>
                      <th className="py-2.5 px-4">Type</th>
                      <th className="py-2.5 px-4">Location</th>
                      <th className="py-2.5 px-4 text-center">Units</th>
                      <th className="py-2.5 px-4 text-center">Occupied</th>
                      <th className="py-2.5 px-4 text-center">Vacant</th>
                      <th className="py-2.5 px-4 text-right">Occupancy %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {propertiesTable.map((p) => (
                      <tr
                        key={p.id}
                        className="h-[48px] hover:bg-accent/50 transition-colors group cursor-pointer"
                      >
                        <td className="py-2 px-4 font-medium text-foreground">
                          <Link href={`/landlord/properties/${p.id}`} className="hover:underline block truncate">
                            {p.name}
                          </Link>
                        </td>
                        <td className="py-2 px-4 capitalize text-muted-foreground">
                          <Link href={`/landlord/properties/${p.id}`} className="block">
                            {p.propertyType}
                          </Link>
                        </td>
                        <td className="py-2 px-4 text-muted-foreground">
                          <Link href={`/landlord/properties/${p.id}`} className="block">
                            {p.city}, {p.state}
                          </Link>
                        </td>
                        <td className="py-2 px-4 text-center text-foreground/80">
                          <Link href={`/landlord/properties/${p.id}`} className="block">
                            {p.totalUnits}
                          </Link>
                        </td>
                        <td className="py-2 px-4 text-center font-medium text-success">
                          <Link href={`/landlord/properties/${p.id}`} className="block">
                            {p.occupiedUnits}
                          </Link>
                        </td>
                        <td className="py-2 px-4 text-center text-muted-foreground">
                          <Link href={`/landlord/properties/${p.id}`} className="block">
                            {p.vacantUnits}
                          </Link>
                        </td>
                        <td className="py-2 px-4 text-right font-medium text-foreground">
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
                    className="block p-4 rounded-xl border border-border bg-card hover:bg-accent/40 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground text-base">{p.name}</span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-muted border border-border text-muted-foreground capitalize">
                        {p.propertyType}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {p.city}, {p.state}
                    </p>

                    <div className="mt-3 pt-3 border-t border-border grid grid-cols-4 gap-2 text-center text-xs">
                      <div>
                        <span className="block text-subtle-foreground text-[10px] uppercase">Units</span>
                        <span className="font-bold text-foreground mt-0.5 block">{p.totalUnits}</span>
                      </div>
                      <div>
                        <span className="block text-subtle-foreground text-[10px] uppercase">Occupied</span>
                        <span className="font-bold text-success mt-0.5 block">{p.occupiedUnits}</span>
                      </div>
                      <div>
                        <span className="block text-subtle-foreground text-[10px] uppercase">Vacant</span>
                        <span className="font-bold text-muted-foreground mt-0.5 block">{p.vacantUnits}</span>
                      </div>
                      <div>
                        <span className="block text-subtle-foreground text-[10px] uppercase">Rate</span>
                        <span className="font-bold text-foreground mt-0.5 block">{p.occupancyRate}%</span>
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
