'use client';

import { trpc } from "@/utils/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { AccountSection } from "@/components/settings/AccountSection";
import { UserCheck } from "lucide-react";

export default function TenantSettingsPage() {
  const { data: user, isLoading: isLoadingUser } = trpc.auth.me.useQuery();
  const { data: leases, isLoading: isLoadingLeases } = trpc.leases.getMine.useQuery();

  const activeLease = leases?.find((l) => !l.terminatedAt);
  const landlord = activeLease?.unit?.property?.landlord;

  if (isLoadingUser || isLoadingLeases) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white">
        <PageHeader title="Settings" />
        <PageContainer>
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-56 w-full rounded-xl" />
          </div>
        </PageContainer>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <PageHeader title="Settings" />

      <PageContainer>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Account Settings</h1>
          <p className="text-neutral-400 mt-1 text-sm">
            Manage your personal details and security preferences.
          </p>
        </div>

        <div className="space-y-6">
          {/* Your Landlord Card (if tenancy exists) */}
          {landlord && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-6 backdrop-blur-sm space-y-4">
              <div className="flex items-center space-x-2 border-b border-neutral-800 pb-3">
                <UserCheck className="w-4 h-4 text-neutral-400" />
                <h3 className="font-bold text-white text-xs uppercase tracking-wider">
                  Your Landlord
                </h3>
              </div>

              <div className="space-y-3">
                <div>
                  <h4 className="font-bold text-white text-base">{landlord.fullName}</h4>
                  <p className="text-xs text-green-400 font-semibold uppercase tracking-wider mt-0.5">
                    Active Landlord
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-neutral-800 text-xs text-neutral-400">
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                      Email Address
                    </span>
                    <span className="text-white font-medium block mt-0.5">
                      {landlord.email}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                      Phone Number
                    </span>
                    <span className="text-white font-medium block mt-0.5">
                      {landlord.phone || "—"}
                    </span>
                  </div>
                  {activeLease?.unit?.property && (
                    <div>
                      <span className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                        Property / Unit
                      </span>
                      <span className="text-white font-medium block mt-0.5">
                        {activeLease.unit.property.name} (Unit {activeLease.unit.unitNumber})
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <AccountSection user={user} />
        </div>
      </PageContainer>
    </div>
  );
}
