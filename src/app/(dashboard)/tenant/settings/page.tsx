'use client';

import { trpc } from "@/utils/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { AccountSection } from "@/components/settings/AccountSection";

export default function TenantSettingsPage() {
  const { data: user, isLoading } = trpc.auth.me.useQuery();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <PageHeader title="Settings" />
        <PageContainer width="narrow">
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="space-y-6">
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
    <div className="min-h-screen bg-background text-foreground">
      <PageHeader title="Settings" />

      <PageContainer width="narrow">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Account Settings</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage your personal details and security preferences.
          </p>
        </div>

        <div className="space-y-6">
          <AccountSection user={user} />
        </div>
      </PageContainer>
    </div>
  );
}
