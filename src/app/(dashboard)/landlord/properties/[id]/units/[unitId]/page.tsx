'use client';

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { RentFrequency } from "@prisma/client";

export default function UnitDetailPage() {
  const params = useParams();
  const propertyId = params.id as string;
  const unitId = params.unitId as string;
  const utils = trpc.useUtils();

  // Queries
  const { data: properties } = trpc.properties.list.useQuery();
  const { data: unitStatus, isLoading: isLoadingStatus } = trpc.units.getStatus.useQuery({ id: unitId });
  const { data: leases, isLoading: isLoadingLeases } = trpc.leases.getForUnit.useQuery({ unitId });

  // Find unit details from properties list
  const property = properties?.find((p) => p.id === propertyId);
  const unit = property?.units.find((u) => u.id === unitId);

  // Active Lease if exists
  const activeLease = leases?.find(
    (l) =>
      !l.terminatedAt &&
      new Date(l.startDate) <= new Date() &&
      new Date(l.endDate) >= new Date()
  );

  // Timeline query
  const { data: timeline } = trpc.leases.getTimeline.useQuery(
    { leaseId: activeLease?.id || "" },
    { enabled: !!activeLease?.id }
  );

  // Mutations
  const createLease = trpc.leases.create.useMutation({
    onSuccess: () => {
      utils.leases.getForUnit.invalidate({ unitId });
      utils.units.getStatus.invalidate({ id: unitId });
      utils.properties.list.invalidate();
      setIsAddLeaseOpen(false);
      resetLeaseForm();
    },
    onError: (err) => {
      setLeaseError(err.message);
    },
  });

  const uploadDocMutation = trpc.leases.uploadDocument.useMutation();

  // States
  const [isAddLeaseOpen, setIsAddLeaseOpen] = useState(false);
  const [tenantName, setTenantName] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rentAmount, setRentAmount] = useState("");
  const [rentFrequency, setRentFrequency] = useState<RentFrequency>(RentFrequency.monthly);
  const [depositAmount, setDepositAmount] = useState("");
  const [renewalWindowDays, setRenewalWindowDays] = useState("60");
  const [leaseError, setLeaseError] = useState<string | null>(null);

  // File Upload State
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Copy Invitation States
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = (code: string) => {
    const signupLink = `${window.location.origin}/signup?code=${code}`;
    navigator.clipboard.writeText(signupLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const resetLeaseForm = () => {
    setTenantName("");
    setTenantEmail("");
    setStartDate("");
    setEndDate("");
    setRentAmount("");
    setRentFrequency(RentFrequency.monthly);
    setDepositAmount("");
    setRenewalWindowDays("60");
    setLeaseError(null);
  };

  const handleCreateLease = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeaseError(null);

    const rent = parseFloat(rentAmount);
    const deposit = depositAmount ? parseFloat(depositAmount) : undefined;
    const renewalDays = parseInt(renewalWindowDays);

    if (isNaN(rent) || rent <= 0) {
      setLeaseError("Rent amount must be a positive number.");
      return;
    }
    if (depositAmount && (isNaN(deposit!) || deposit! <= 0)) {
      setLeaseError("Deposit amount must be a positive number.");
      return;
    }
    if (isNaN(renewalDays) || renewalDays <= 0) {
      setLeaseError("Renewal window days must be a positive integer.");
      return;
    }

    try {
      await createLease.mutateAsync({
        unitId,
        tenantName,
        tenantEmail,
        startDate,
        endDate,
        rentAmount: rent,
        rentFrequency,
        depositAmount: deposit,
        renewalWindowDays: renewalDays,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create lease.";
      setLeaseError(message);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeLease) return;
    setUploadError(null);

    // 10MB limit
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File size exceeds 10MB limit.");
      return;
    }

    // PDF/Image only
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setUploadError("Only PDF and image files are allowed.");
      return;
    }

    setUploading(true);

    try {
      // 1. Get signed upload URL from server
      const { signedUrl } = await uploadDocMutation.mutateAsync({
        leaseId: activeLease.id,
        fileName: file.name,
      });

      // 2. Upload file directly to Supabase Storage via signed URL
      const response = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to upload file to storage.");
      }

      // 3. Refresh lease details to reflect documentUrl in UI
      utils.leases.getForUnit.invalidate({ unitId });
      alert("Lease agreement uploaded successfully!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred during file upload.";
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  };

  const handleViewDocument = async () => {
    if (!activeLease) return;
    try {
      const { signedUrl } = await utils.client.leases.getDocumentUrl.query({
        leaseId: activeLease.id,
      });
      window.open(signedUrl, "_blank");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch document link.";
      alert(message);
    }
  };

  if (isLoadingStatus || isLoadingLeases) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-white">
        <p className="text-lg">Loading unit details...</p>
      </div>
    );
  }

  if (!property || !unit) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 text-white">
        <p className="text-lg">Unit not found.</p>
        <Link href="/landlord/properties" className="text-sm underline mt-2">
          Back to properties
        </Link>
      </div>
    );
  }

  // Visual Timeline math
  let todayPercent = 0;
  let renewalPercent = 0;

  if (timeline) {
    const startMs = new Date(timeline.startDate).getTime();
    const endMs = new Date(timeline.endDate).getTime();
    const todayMs = new Date().getTime();

    const totalDuration = endMs - startMs;
    const elapsed = Math.max(0, Math.min(totalDuration, todayMs - startMs));
    todayPercent = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;

    const renewalStartDateMs = new Date(timeline.renewalStartDate).getTime();
    const renewalDuration = endMs - renewalStartDateMs;
    renewalPercent = totalDuration > 0 ? (renewalDuration / totalDuration) * 100 : 0;
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
            <Link
              href={`/landlord/properties/${propertyId}`}
              className="text-sm font-medium text-neutral-400 hover:text-white transition-colors"
            >
              {property.name}
            </Link>
            <span className="text-neutral-500">/</span>
            <span className="text-sm font-medium text-neutral-300">Unit {unit.unitNumber}</span>
          </div>

          <div className="flex items-center space-x-3">
            {!activeLease && (
              <Button
                onClick={() => setIsAddLeaseOpen(true)}
                className="bg-white text-neutral-950 hover:bg-neutral-200 h-9 px-4 text-sm"
              >
                Create Lease
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Unit Info Card */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-6 backdrop-blur-sm flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Unit {unit.unitNumber}</h1>
            <p className="text-neutral-400 text-sm mt-1 capitalize">
              {unit.unitType} {unit.sizeSqm ? `• ${unit.sizeSqm} sqm` : ""}
            </p>
          </div>
          <div>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                unitStatus?.status === "occupied"
                  ? "bg-green-950/30 text-green-400 border border-green-900/30"
                  : "bg-yellow-950/30 text-yellow-400 border border-yellow-900/30"
              }`}
            >
              {unitStatus?.status}
            </span>
          </div>
        </div>

        {/* Active Lease Section */}
        {activeLease && timeline ? (
          <div className="space-y-6">
            <h2 className="text-xl font-bold tracking-tight">Active Tenancy</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Timeline Display Card */}
              <div className="md:col-span-2 rounded-xl border border-neutral-800 bg-neutral-900/20 p-6 space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-white text-lg">Lease Timeline</h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                      timeline.status === "renewal_due"
                        ? "bg-yellow-950/30 text-yellow-400 border border-yellow-900/30 animate-pulse"
                        : "bg-green-950/30 text-green-400 border border-green-900/30"
                    }`}
                  >
                    {timeline.status.replace("_", " ")}
                  </span>
                </div>

                {/* Progress Visual Tracker */}
                <div className="space-y-3 pt-4">
                  <div className="relative w-full h-3 rounded-full bg-neutral-800 overflow-visible">
                    {/* Renewal window highlights */}
                    <div
                      className="absolute top-0 bottom-0 right-0 bg-yellow-950/60 border-l border-yellow-800 rounded-r-full"
                      style={{ width: `${renewalPercent}%` }}
                    />
                    {/* Elapsed progress tracker */}
                    <div
                      className="absolute top-0 bottom-0 left-0 bg-neutral-600 rounded-l-full"
                      style={{ width: `${todayPercent}%` }}
                    />
                    {/* Current day marker dot */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 border-white bg-white shadow-md cursor-pointer transition-transform hover:scale-110"
                      style={{ left: `calc(${todayPercent}% - 10px)` }}
                      title="Today"
                    />
                  </div>

                  <div className="flex justify-between text-xs text-neutral-500 font-medium pt-1">
                    <span>Start: {new Date(timeline.startDate).toLocaleDateString()}</span>
                    <span
                      style={{ marginRight: `${renewalPercent / 2}%` }}
                      className="text-yellow-500 font-semibold"
                    >
                      Renewal Window (60d before end)
                    </span>
                    <span>End: {new Date(timeline.endDate).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Summary details */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-neutral-800/40 text-sm">
                  <div>
                    <span className="block text-neutral-500 text-xs">Tenant</span>
                    <span className="font-semibold text-white mt-0.5 block">{timeline.tenantName}</span>
                  </div>
                  <div>
                    <span className="block text-neutral-500 text-xs">Rent</span>
                    <span className="font-semibold text-white mt-0.5 block">
                      ₦{timeline.rentAmount.toLocaleString()} / {timeline.rentFrequency}
                    </span>
                  </div>
                  <div>
                    <span className="block text-neutral-500 text-xs">Deposit</span>
                    <span className="font-semibold text-white mt-0.5 block">
                      {activeLease.depositAmount ? `₦${Number(activeLease.depositAmount).toLocaleString()}` : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-neutral-500 text-xs">Invite Status</span>
                    <span className="font-semibold text-white mt-0.5 block">
                      {activeLease.inviteCodes[0] ? (
                        <span className="text-yellow-500 font-mono">
                          Invite Code: {activeLease.inviteCodes[0].code} (Awaiting Tenant)
                        </span>
                      ) : (
                        <span className="text-green-400">Claimed & Linked</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Signed Document Wallet Card */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-6 flex flex-col justify-between space-y-4">
                <div>
                  <h3 className="font-bold text-white text-lg">Digital Wallet</h3>
                  <p className="text-neutral-500 text-xs mt-1">
                    Store and view lease agreements. Accepts PDF and image files, max 10MB.
                  </p>

                  {uploadError && (
                    <div className="mt-3 rounded bg-red-950/20 border border-red-900/30 p-2.5 text-xs text-red-400">
                      {uploadError}
                    </div>
                  )}

                  {activeLease.documentUrl ? (
                    <div className="mt-4 p-3 rounded-lg border border-neutral-800 bg-neutral-900/40 flex items-center justify-between">
                      <div className="flex items-center space-x-2 truncate">
                        <span className="text-xs font-semibold text-neutral-300 truncate">Lease_Agreement.pdf</span>
                      </div>
                      <Button
                        onClick={handleViewDocument}
                        variant="outline"
                        className="border-neutral-800 text-xs h-7 px-2.5 text-white hover:bg-neutral-900"
                      >
                        View File
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-500 mt-6 italic text-center">No documents uploaded yet.</p>
                  )}
                </div>

                <div className="pt-4 border-t border-neutral-800/40">
                  <label className="block">
                    <span className="sr-only">Upload lease agreement</span>
                    <input
                      type="file"
                      accept=".pdf, image/*"
                      onChange={handleFileUpload}
                      disabled={uploading}
                      className="block w-full text-xs text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-white file:text-neutral-950 hover:file:bg-neutral-200 file:cursor-pointer disabled:opacity-50"
                    />
                  </label>
                  {uploading && <p className="text-xs text-neutral-400 mt-2">Uploading file to storage...</p>}
                </div>
              </div>
            </div>

            {/* Tenant invitation card for landlords to copy/share */}
            {activeLease.inviteCodes?.[0] && (
              <div className="rounded-xl border border-yellow-900/30 bg-yellow-950/5 p-6 backdrop-blur-sm space-y-4">
                <div className="flex items-start space-x-3">
                  <span className="text-xl">✉️</span>
                  <div>
                    <h3 className="text-lg font-bold text-yellow-550">Tenant Invitation Pending</h3>
                    <p className="text-neutral-400 text-sm mt-1">
                      This lease has been created, but the tenant hasn&apos;t joined PropLink yet. Share the code or the direct signup link below so they can claim their lease.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="rounded-lg bg-neutral-900 border border-neutral-800/60 p-4 flex items-center justify-between">
                    <div>
                      <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Invite Code</span>
                      <span className="font-mono text-lg font-bold text-white block mt-1 tracking-wider">{activeLease.inviteCodes[0].code}</span>
                    </div>
                    <Button
                      onClick={() => handleCopyCode(activeLease.inviteCodes[0].code)}
                      variant="outline"
                      className="border-neutral-800 text-xs h-9 px-3 hover:bg-neutral-800 hover:text-white transition-colors"
                    >
                      {copiedCode ? "Copied! ✓" : "Copy Code"}
                    </Button>
                  </div>

                  <div className="rounded-lg bg-neutral-900 border border-neutral-800/60 p-4 flex items-center justify-between">
                    <div>
                      <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Direct Signup Link</span>
                      <span className="text-neutral-400 text-xs truncate max-w-[200px] sm:max-w-xs block mt-1">
                        {`${typeof window !== "undefined" ? window.location.origin : ""}/signup?code=${activeLease.inviteCodes[0].code}`}
                      </span>
                    </div>
                    <Button
                      onClick={() => handleCopyLink(activeLease.inviteCodes[0].code)}
                      variant="outline"
                      className="border-neutral-800 text-xs h-9 px-3 hover:bg-neutral-800 hover:text-white transition-colors"
                    >
                      {copiedLink ? "Link Copied! ✓" : "Copy Link"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-12 text-center max-w-xl mx-auto space-y-4">
            <h3 className="text-lg font-medium text-white">This unit is vacant</h3>
            <p className="text-neutral-400 text-sm">
              Create a formal tenancy lease to link a tenant to this unit and enable tracking.
            </p>
            <Button
              onClick={() => setIsAddLeaseOpen(true)}
              className="bg-white text-neutral-950 hover:bg-neutral-200 mt-2"
            >
              Add New Lease
            </Button>
          </div>
        )}

        {/* Leases History table */}
        {leases && leases.length > 0 && (
          <div className="space-y-4 pt-6 border-t border-neutral-800">
            <h2 className="text-xl font-bold tracking-tight">Lease History</h2>
            <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/20">
              <table className="min-w-full divide-y divide-neutral-800">
                <thead className="bg-neutral-900/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">Tenant</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">Start Date</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">End Date</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">Rent</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {leases.map((l) => (
                    <tr key={l.id} className="hover:bg-neutral-900/10">
                      <td className="px-6 py-4 text-sm font-semibold text-white">{l.tenant.fullName}</td>
                      <td className="px-6 py-4 text-sm text-neutral-400">
                        {new Date(l.startDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-400">
                        {new Date(l.endDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-300">
                        ₦{Number(l.rentAmount).toLocaleString()} / {l.rentFrequency}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                            l.terminatedAt
                              ? "bg-red-950/20 text-red-400 border border-red-900/30"
                              : new Date(l.endDate) < new Date()
                              ? "bg-neutral-800 text-neutral-400"
                              : "bg-green-950/20 text-green-400 border border-green-900/30"
                          }`}
                        >
                          {l.terminatedAt
                            ? "Terminated"
                            : new Date(l.endDate) < new Date()
                            ? "Expired"
                            : "Active"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Add Lease Modal */}
      {isAddLeaseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-8 shadow-2xl flex flex-col space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold tracking-tight">Create Tenancy Lease</h2>
              <button
                onClick={() => {
                  setIsAddLeaseOpen(false);
                  resetLeaseForm();
                }}
                className="text-neutral-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateLease} className="space-y-4">
              {leaseError && (
                <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-3 text-sm text-red-400">
                  {leaseError}
                </div>
              )}

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="tenantName" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Tenant Full Name
                    </label>
                    <input
                      id="tenantName"
                      type="text"
                      required
                      value={tenantName}
                      onChange={(e) => setTenantName(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                      placeholder="e.g. Sandra Okon"
                    />
                  </div>
                  <div>
                    <label htmlFor="tenantEmail" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Tenant Email
                    </label>
                    <input
                      id="tenantEmail"
                      type="email"
                      required
                      value={tenantEmail}
                      onChange={(e) => setTenantEmail(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                      placeholder="sandra@example.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="startDate" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Start Date
                    </label>
                    <input
                      id="startDate"
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-[38px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="endDate" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      End Date
                    </label>
                    <input
                      id="endDate"
                      type="date"
                      required
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-[38px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="rentAmount" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Rent Amount (₦)
                    </label>
                    <input
                      id="rentAmount"
                      type="number"
                      required
                      value={rentAmount}
                      onChange={(e) => setRentAmount(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                      placeholder="e.g. 150000"
                    />
                  </div>
                  <div>
                    <label htmlFor="rentFrequency" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Frequency
                    </label>
                    <select
                      id="rentFrequency"
                      value={rentFrequency}
                      onChange={(e) => setRentFrequency(e.target.value as RentFrequency)}
                      className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-[38px]"
                    >
                      <option value={RentFrequency.monthly}>Monthly</option>
                      <option value={RentFrequency.quarterly}>Quarterly</option>
                      <option value={RentFrequency.annually}>Annually</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="renewalWindowDays" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Renewal Window (days)
                  </label>
                  <input
                    id="renewalWindowDays"
                    type="number"
                    required
                    value={renewalWindowDays}
                    onChange={(e) => setRenewalWindowDays(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                    placeholder="60"
                  />
                </div>
              </div>

              <div className="flex space-x-3 mt-6 pt-4 border-t border-neutral-800">
                <Button
                  type="button"
                  onClick={() => {
                    setIsAddLeaseOpen(false);
                    resetLeaseForm();
                  }}
                  variant="outline"
                  className="w-1/2 border-neutral-800 text-white hover:bg-neutral-900 h-10 text-sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createLease.isPending}
                  className="w-1/2 bg-white text-neutral-950 hover:bg-neutral-200 h-10 text-sm"
                >
                  {createLease.isPending ? "Creating..." : "Save Lease"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
