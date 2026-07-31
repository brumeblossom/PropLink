'use client';

import { useState, useMemo } from "react";
import { trpc } from "@/utils/trpc";

import { 
  Users, 
  Search, 
  Building2, 
  Mail, 
  Phone, 
  Calendar, 
  ArrowUpRight,
  User
} from "lucide-react";
import Link from "next/link";

interface LeaseItem {
  id: string;
  startDate: string | Date;
  endDate: string | Date;
  terminatedAt: string | Date | null;
  renewalWindowDays: number;
  tenant: {
    fullName: string;
    email: string;
    phone: string | null;
    avatarUrl: string | null;
  };
  unit: {
    id: string;
    unitNumber: string;
    propertyId: string;
    property: {
      name: string;
    };
  };
}

function getLeaseStatus(lease: { startDate: string | Date; endDate: string | Date; terminatedAt: string | Date | null; renewalWindowDays: number }) {
  if (lease.terminatedAt) return "terminated";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(lease.startDate);
  const end = new Date(lease.endDate);
  if (today < start) return "upcoming";
  if (today > end) return "expired";
  const renewalStart = new Date(end);
  renewalStart.setDate(renewalStart.getDate() - lease.renewalWindowDays);
  return today >= renewalStart ? "renewal_due" : "active";
}

export default function LandlordTenantsPage() {
  const { data: leases, isLoading } = trpc.leases.getLandlordTenants.useQuery();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "current" | "past">("all");

  // Group leases by tenant email
  const tenants = useMemo(() => {
    if (!leases) return [];

    const grouped = new Map<string, {
      fullName: string;
      email: string;
      phone: string | null;
      avatarUrl: string | null;
      leases: Array<LeaseItem & { status: string }>;
      isCurrent: boolean;
    }>();

    leases.forEach((lease) => {
      const email = lease.tenant.email.toLowerCase().trim();
      const status = getLeaseStatus(lease);
      const isCurrentLease = status === "active" || status === "renewal_due" || status === "upcoming";

      const existing = grouped.get(email);
      if (existing) {
        existing.leases.push({ ...lease, status });
        if (isCurrentLease) {
          existing.isCurrent = true;
        }
      } else {
        grouped.set(email, {
          fullName: lease.tenant.fullName,
          email: lease.tenant.email,
          phone: lease.tenant.phone,
          avatarUrl: lease.tenant.avatarUrl,
          leases: [{ ...lease, status }],
          isCurrent: isCurrentLease,
        });
      }
    });

    return Array.from(grouped.values());
  }, [leases]);

  // Filter & Search tenants
  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      const matchesSearch = 
        t.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.phone && t.phone.includes(searchQuery));

      const matchesFilter =
        filter === "all" ||
        (filter === "current" && t.isCurrent) ||
        (filter === "past" && !t.isCurrent);

      return matchesSearch && matchesFilter;
    });
  }, [tenants, searchQuery, filter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-neutral-500 text-sm animate-pulse">Loading tenants...</p>
      </div>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">All Tenants</h1>
          <p className="text-neutral-400 mt-1 text-sm">
            View every tenant you have ever hosted across your properties.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-neutral-400 text-sm bg-neutral-900/50 border border-neutral-800 rounded-xl px-4 py-2">
          <Users className="w-4 h-4 text-neutral-500" />
          <span className="font-semibold text-white">{tenants.length}</span>
          <span>total tenants</span>
        </div>
      </div>

      {/* Filter and Search controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-neutral-900/30 p-4 rounded-xl border border-neutral-800/80 backdrop-blur-sm">
        <div className="flex rounded-lg bg-neutral-900 border border-neutral-800 p-0.5 text-xs">
          {(["all", "current", "past"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-1.5 rounded-md font-semibold capitalize transition-all ${
                filter === tab
                  ? "bg-white text-neutral-950 shadow-md"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
          <input
            type="text"
            placeholder="Search name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-700 transition-colors"
          />
        </div>
      </div>

      {/* Tenants List Grid */}
      {filteredTenants.length === 0 ? (
        <div className="text-center py-20 rounded-xl border border-neutral-800 bg-neutral-900/10">
          <Users className="w-12 h-12 mx-auto text-neutral-600 mb-4" />
          <h3 className="text-lg font-semibold text-white">No tenants found</h3>
          <p className="text-neutral-500 text-sm mt-1">
            Try adjusting your search query or filter tab.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTenants.map((tenant) => (
            <div
              key={tenant.email}
              className="rounded-xl border border-neutral-800 bg-neutral-900/20 hover:border-neutral-700/80 transition-all p-5 flex flex-col justify-between space-y-5"
            >
              {/* Header Info */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center space-x-3.5 min-w-0">
                  {tenant.avatarUrl ? (
                    <img
                      src={tenant.avatarUrl}
                      alt={tenant.fullName}
                      className="w-11 h-11 rounded-full object-cover border border-neutral-800"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400">
                      <User className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-bold text-white text-base truncate" title={tenant.fullName}>
                      {tenant.fullName}
                    </h3>
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border mt-1.5 ${
                        tenant.isCurrent
                          ? "bg-green-950/30 text-green-400 border-green-900/30"
                          : "bg-neutral-900 text-neutral-400 border-neutral-800"
                      }`}
                    >
                      {tenant.isCurrent ? "Current Tenant" : "Past Tenant"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Contact Details */}
              <div className="space-y-2 text-xs text-neutral-400 border-t border-neutral-900 pt-3">
                <div className="flex items-center space-x-2 truncate">
                  <Mail className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <span className="truncate">{tenant.email}</span>
                </div>
                {tenant.phone && (
                  <div className="flex items-center space-x-2">
                    <Phone className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                    <span>{tenant.phone}</span>
                  </div>
                )}
              </div>

              {/* Tenancies Log */}
              <div className="space-y-2 border-t border-neutral-900 pt-3 flex-1 flex flex-col justify-end">
                <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Tenancy Records</h4>
                <div className="space-y-2">
                  {tenant.leases.map((lease) => (
                    <div
                      key={lease.id}
                      className="p-2.5 rounded-lg border border-neutral-850 bg-neutral-950/40 text-xs flex flex-col gap-1 hover:bg-neutral-950/80 transition-colors"
                    >
                      <div className="flex items-center justify-between font-semibold text-neutral-200">
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-neutral-500" />
                          {lease.unit.property.name} · Unit {lease.unit.unitNumber}
                        </span>
                        <Link
                          href={`/landlord/properties/${lease.unit.propertyId}/units/${lease.unit.id}`}
                          className="text-neutral-400 hover:text-white transition-colors"
                          title="View Unit Detail"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-neutral-400 font-sans mt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-neutral-500" />
                          {new Date(lease.startDate).toLocaleDateString()} - {new Date(lease.endDate).toLocaleDateString()}
                        </span>
                        <span className={`capitalize ${
                          lease.status === "active" || lease.status === "renewal_due" ? "text-green-400 font-semibold" : "text-neutral-500"
                        }`}>
                          {lease.status.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
