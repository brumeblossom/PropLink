'use client';

import { useState } from "react";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { createClient } from "@/utils/supabase/client";
import { Shield, Save, Key, Eye, EyeOff, UserCheck } from "lucide-react";

export default function TenantSettingsPage() {
  const utils = trpc.useUtils();

  const { data: user, isLoading: isLoadingUser } = trpc.auth.me.useQuery();
  const { data: leases, isLoading: isLoadingLeases } = trpc.leases.getMine.useQuery();

  const activeLease = leases?.find((l) => !l.terminatedAt);
  const landlord = activeLease?.unit.property.landlord;
  
  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      setProfileSuccess("Settings updated successfully!");
      setProfileError(null);
      setTimeout(() => setProfileSuccess(null), 3000);
    },
    onError: (err) => {
      setProfileError(err.message);
      setProfileSuccess(null);
    },
  });

  const [fullName, setFullName] = useState("");
  const [isProfileInitialized, setIsProfileInitialized] = useState(false);
  
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password State
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  if (user && !isProfileInitialized) {
    setFullName(user.fullName);
    setIsProfileInitialized(true);
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || fullName.trim().length < 2) {
      setProfileError("Full name must be at least 2 characters long.");
      return;
    }

    try {
      await updateProfile.mutateAsync({ fullName: fullName.trim() });
    } catch {
      // Handled by mutation onError
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setUpdatingPassword(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        throw error;
      }

      setPasswordSuccess("Password updated successfully!");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSuccess(null), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update password.";
      setPasswordError(message);
    } finally {
      setUpdatingPassword(false);
    }
  };

  if (isLoadingUser || isLoadingLeases) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white">
        <PageHeader title="Settings" />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <PageHeader title="Settings" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
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
                <h3 className="font-bold text-white text-xs uppercase tracking-wider">Your Landlord</h3>
              </div>
              
              <div className="space-y-3">
                <div>
                  <h4 className="font-bold text-white text-base">{landlord.fullName}</h4>
                  <p className="text-xs text-green-400 font-semibold uppercase tracking-wider mt-0.5">Active Landlord</p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-neutral-800 text-xs text-neutral-400">
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Email Address</span>
                    <span className="text-white font-medium block mt-0.5">{landlord.email}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Phone Number</span>
                    <span className="text-white font-medium block mt-0.5">{landlord.phone || "—"}</span>
                  </div>
                  {activeLease?.unit?.property && (
                    <div>
                      <span className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Property / Unit</span>
                      <span className="text-white font-medium block mt-0.5">
                        {activeLease.unit.property.name} (Unit {activeLease.unit.unitNumber})
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* General Information Card */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-6 backdrop-blur-sm space-y-6">
            <div className="flex items-center space-x-2 border-b border-neutral-800 pb-3">
              <Shield className="w-5 h-5 text-neutral-400" />
              <h2 className="text-lg font-bold text-white">General Information</h2>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              {profileSuccess && (
                <div className="rounded-lg bg-green-950/20 border border-green-900/30 p-3 text-sm text-green-400">
                  {profileSuccess}
                </div>
              )}
              {profileError && (
                <div className="rounded-lg bg-red-950/20 border border-red-900/30 p-3 text-sm text-red-400">
                  {profileError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                  Email Address
                </label>
                <input
                  type="email"
                  disabled
                  value={user?.email || ""}
                  className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-2 text-neutral-400 text-sm cursor-not-allowed"
                />
                <p className="text-xs text-neutral-500 mt-1">Your registered login address cannot be changed.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                  placeholder="Enter your full name"
                />
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={updateProfile.isPending}
                  className="bg-white text-neutral-950 hover:bg-neutral-200 font-semibold h-10 px-6 flex items-center space-x-2 text-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>{updateProfile.isPending ? "Saving..." : "Save Changes"}</span>
                </Button>
              </div>
            </form>
          </div>

          {/* Security & Password Card */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-6 backdrop-blur-sm space-y-6">
            <div className="flex items-center space-x-2 border-b border-neutral-800 pb-3">
              <Key className="w-5 h-5 text-neutral-400" />
              <h2 className="text-lg font-bold text-white">Security &amp; Password</h2>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              {passwordSuccess && (
                <div className="rounded-lg bg-green-950/20 border border-green-900/30 p-3 text-sm text-green-400">
                  {passwordSuccess}
                </div>
              )}
              {passwordError && (
                <div className="rounded-lg bg-red-950/20 border border-red-900/30 p-3 text-sm text-red-400">
                  {passwordError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  New Password
                </label>
                <div className="relative mt-1">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 pr-10 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                    placeholder="Minimum 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-white"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Confirm New Password
                </label>
                <div className="relative mt-1">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 pr-10 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                    placeholder="Repeat new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-white"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={updatingPassword}
                  className="bg-white text-neutral-950 hover:bg-neutral-200 font-semibold h-10 px-6 flex items-center space-x-2 text-sm"
                >
                  <Key className="w-4 h-4" />
                  <span>{updatingPassword ? "Updating..." : "Update Password"}</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
