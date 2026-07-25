'use client';

import { useRouter } from "next/navigation";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";

export default function TenantDashboard() {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Queries
  const { data: user, isLoading: isLoadingUser } = trpc.auth.me.useQuery();
  const { data: leases, isLoading: isLoadingLeases } = trpc.leases.getMine.useQuery();

  const logoutMutation = trpc.auth.logout.useMutation();

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const handleDownloadAgreement = async (leaseId: string) => {
    try {
      const { signedUrl } = await utils.client.leases.getDocumentUrl.query({ leaseId });
      window.open(signedUrl, "_blank");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch document download link.";
      alert(message);
    }
  };

  if (isLoadingUser || isLoadingLeases) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-white font-sans">
        <p className="text-lg animate-pulse">Loading lease details...</p>
      </div>
    );
  }

  // Find the current active lease
  const activeLease = leases?.find((l) => !l.terminatedAt);

  // Compute status for display
  let leaseStatus: "active" | "renewal_due" | "expired" | "upcoming" | "terminated" = "active";
  let isRenewalDue = false;

  if (activeLease) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(activeLease.startDate);
    const end = new Date(activeLease.endDate);

    if (activeLease.terminatedAt) {
      leaseStatus = "terminated";
    } else if (today < start) {
      leaseStatus = "upcoming";
    } else if (today > end) {
      leaseStatus = "expired";
    } else {
      const renewalStartDate = new Date(end);
      renewalStartDate.setDate(renewalStartDate.getDate() - activeLease.renewalWindowDays);
      if (today >= renewalStartDate) {
        leaseStatus = "renewal_due";
        isRenewalDue = true;
      } else {
        leaseStatus = "active";
      }
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-white selection:text-neutral-950">
      {/* Top Navbar */}
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">
              PropLink
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-900 border border-neutral-800 text-neutral-300">
              Tenant Portal
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <span className="text-sm text-neutral-400 hidden sm:inline">
              {user?.email}
            </span>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="border-neutral-800 text-white hover:bg-neutral-900 text-sm h-9 px-4 transition-all"
            >
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Dashboard Space */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Welcome back, {user?.fullName || "Tenant"}
          </h1>
          <p className="text-neutral-400 mt-1 text-sm">
            Access your active lease, rental terms, and landlord-uploaded documents.
          </p>
        </div>

        {activeLease ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Lease Summary Card */}
            <div className="lg:col-span-2 rounded-xl border border-neutral-800 bg-neutral-900/10 p-6 backdrop-blur-sm space-y-6 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">
                      {activeLease.unit.property.name}
                    </h2>
                    <p className="text-neutral-400 text-sm mt-0.5">
                      {activeLease.unit.property.address}, {activeLease.unit.property.city}, {activeLease.unit.property.state}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold capitalize border ${
                      leaseStatus === "renewal_due"
                        ? "bg-yellow-950/30 text-yellow-400 border-yellow-900/30 animate-pulse"
                        : leaseStatus === "active"
                        ? "bg-green-950/30 text-green-400 border-green-900/30"
                        : "bg-neutral-900 text-neutral-400 border-neutral-800"
                    }`}
                  >
                    Lease: {leaseStatus.replace("_", " ")}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 pt-4 border-t border-neutral-950/50">
                  <div>
                    <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                      Unit
                    </span>
                    <span className="font-bold text-white text-lg block mt-0.5">
                      Unit {activeLease.unit.unitNumber}
                    </span>
                    <span className="text-neutral-400 text-xs capitalize block mt-0.5">
                      {activeLease.unit.unitType}
                    </span>
                  </div>

                  <div>
                    <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                      Rent Rate
                    </span>
                    <span className="font-bold text-white text-lg block mt-0.5">
                      ₦{Number(activeLease.rentAmount).toLocaleString()}
                    </span>
                    <span className="text-neutral-400 text-xs capitalize block mt-0.5">
                      Per {activeLease.rentFrequency}
                    </span>
                  </div>

                  <div>
                    <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                      Security Deposit
                    </span>
                    <span className="font-bold text-white text-lg block mt-0.5">
                      {activeLease.depositAmount ? `₦${Number(activeLease.depositAmount).toLocaleString()}` : "—"}
                    </span>
                    <span className="text-neutral-400 text-xs block mt-0.5">
                      Paid/Secured
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-neutral-950/50 text-sm">
                  <div>
                    <span className="block text-neutral-500 text-xs font-medium">Start Date</span>
                    <span className="font-semibold text-white block mt-0.5">
                      {new Date(activeLease.startDate).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="block text-neutral-500 text-xs font-medium">End Date</span>
                    <span className="font-semibold text-white block mt-0.5">
                      {new Date(activeLease.endDate).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                </div>

                {isRenewalDue && (
                  <div className="rounded-lg bg-yellow-950/20 border border-yellow-900/30 p-3 mt-4 text-xs text-yellow-400 flex items-start space-x-2.5">
                    <span className="text-sm leading-none font-bold mt-0.5">⚠️</span>
                    <div>
                      <p className="font-semibold">Renewal Pending</p>
                      <p className="mt-0.5 opacity-90">
                        Your lease agreement ends on {new Date(activeLease.endDate).toLocaleDateString()}. Please contact your landlord to process your lease renewal.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Document wallet & quick info */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-6 flex flex-col justify-between space-y-6">
              <div>
                <h3 className="font-bold text-white text-lg">Documents Wallet</h3>
                <p className="text-neutral-500 text-xs mt-1">
                  Access your official lease documents.
                </p>

                {activeLease.documentUrl ? (
                  <div className="mt-4 p-3 rounded-lg border border-neutral-800 bg-neutral-900/40 flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-300 truncate max-w-[150px]">
                      Lease_Agreement.pdf
                    </span>
                    <Button
                      onClick={() => handleDownloadAgreement(activeLease.id)}
                      variant="outline"
                      className="border-neutral-800 text-xs h-7 px-2.5 text-white hover:bg-neutral-900 transition-colors"
                    >
                      Download PDF
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500 mt-6 italic text-center">
                    Your landlord has not uploaded a copy of the lease agreement yet.
                  </p>
                )}
              </div>

              <div className="pt-4 border-t border-neutral-800/40 text-xs text-neutral-500 leading-normal">
                Need support with payments or maintenance? Landlord details and contact operations will be enabled in future releases.
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-12 text-center max-w-xl mx-auto space-y-4">
            <h3 className="text-lg font-medium text-white">No active lease found</h3>
            <p className="text-neutral-400 text-sm">
              Your account has successfully registered, but is not currently linked to an active tenancy. Please contact your landlord to request an invitation.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
