'use client';

import { useState } from "react";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/utils/supabase/client";
import { Shield, Pencil, Key, Eye, EyeOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PasswordChecklist, isPasswordValid } from "@/components/auth/PasswordChecklist";

interface AccountSectionProps {
  user: {
    id: string;
    email: string;
    fullName: string;
  };
}

export function AccountSection({ user }: AccountSectionProps) {
  const utils = trpc.useUtils();
  const { toast } = useToast();

  // Modals state
  const [isEditNameOpen, setIsEditNameOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  // Edit Name State
  const [nameValue, setNameValue] = useState(user.fullName || "");
  const [nameError, setNameError] = useState<string | null>(null);

  // Change Password State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
  const [passwordModalGeneralError, setPasswordModalGeneralError] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      setIsEditNameOpen(false);
      setNameError(null);
      toast("Name updated", "success");
    },
    onError: (err) => {
      setNameError(err.message);
    },
  });

  const handleOpenEditName = () => {
    setNameValue(user.fullName || "");
    setNameError(null);
    setIsEditNameOpen(true);
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameValue.trim();
    if (!trimmed) {
      setNameError("Full name is required.");
      return;
    }
    if (trimmed.length > 40) {
      setNameError("Full name cannot exceed 40 characters.");
      return;
    }

    try {
      await updateProfile.mutateAsync({ fullName: trimmed });
    } catch {
      // Handled by onError
    }
  };

  const handleOpenChangePassword = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setCurrentPasswordError(null);
    setPasswordModalGeneralError(null);
    setIsChangePasswordOpen(true);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPasswordError(null);
    setPasswordModalGeneralError(null);

    if (!isPasswordValid(newPassword)) {
      return;
    }

    if (newPassword !== confirmPassword) {
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const supabase = createClient();

      // 1. Re-check current password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        setCurrentPasswordError("Current password is incorrect.");
        setIsUpdatingPassword(false);
        return;
      }

      // 2. Update with new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setPasswordModalGeneralError(updateError.message);
        setIsUpdatingPassword(false);
        return;
      }

      // 3. Success
      setIsChangePasswordOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast("Password changed", "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to change password.";
      setPasswordModalGeneralError(msg);
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const isPasswordReady =
    Boolean(currentPassword) &&
    isPasswordValid(newPassword) &&
    Boolean(confirmPassword) &&
    newPassword === confirmPassword;

  return (
    <>
      {/* Account Section Card */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-6 backdrop-blur-sm space-y-6">
        <div className="flex items-center space-x-2 border-b border-neutral-800 pb-3">
          <Shield className="w-5 h-5 text-neutral-400" />
          <h2 className="text-lg font-bold text-white">Account</h2>
        </div>

        <div className="divide-y divide-neutral-800/60">
          {/* Name Row */}
          <div className="py-4 first:pt-0 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                Full Name
              </span>
              <span className="text-white font-medium text-sm block">
                {user.fullName || "—"}
              </span>
            </div>
            <button
              type="button"
              onClick={handleOpenEditName}
              className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/80 transition-colors"
              aria-label="Edit name"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>

          {/* Email Row */}
          <div className="py-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                Email Address
              </span>
              <span className="text-neutral-300 font-medium text-sm block">
                {user.email || "—"}
              </span>
            </div>
            <span className="text-xs text-neutral-500 font-medium">Read-only</span>
          </div>

          {/* Password Row */}
          <div className="py-4 last:pb-0 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                Password
              </span>
              <span className="text-neutral-400 text-sm block">••••••••••••</span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleOpenChangePassword}
              className="border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-850 h-9 px-3.5 text-xs flex items-center space-x-1.5"
            >
              <Key className="w-4 h-4" />
              <span>Change password</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Edit Name Modal */}
      {isEditNameOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 sm:p-8 shadow-2xl flex flex-col space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold tracking-tight text-white">Edit name</h2>
              <button
                type="button"
                onClick={() => setIsEditNameOpen(false)}
                className="text-neutral-400 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveName} className="space-y-4">
              {nameError && (
                <div className="rounded-lg bg-red-950/20 border border-red-900/30 p-3 text-xs text-red-400">
                  {nameError}
                </div>
              )}

              <div>
                <label
                  htmlFor="edit-full-name"
                  className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider"
                >
                  Full Name
                </label>
                <input
                  id="edit-full-name"
                  type="text"
                  required
                  maxLength={40}
                  value={nameValue}
                  onChange={(e) => {
                    setNameValue(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  placeholder="Enter full name"
                  className="mt-1.5 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3.5 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                />
                <div className="mt-1.5 flex justify-end">
                  <span
                    className={cn(
                      "text-xs transition-colors",
                      nameValue.length >= 40
                        ? "text-red-500 font-medium"
                        : "text-neutral-500"
                    )}
                  >
                    {nameValue.length}/40
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-neutral-800/80">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditNameOpen(false)}
                  className="border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-900 h-9 px-4 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!nameValue.trim() || updateProfile.isPending}
                  className="bg-white text-neutral-950 hover:bg-neutral-200 font-semibold h-9 px-5 text-xs"
                >
                  {updateProfile.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {isChangePasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 sm:p-8 shadow-2xl flex flex-col space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold tracking-tight text-white">Change password</h2>
              <button
                type="button"
                onClick={() => setIsChangePasswordOpen(false)}
                className="text-neutral-400 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              {passwordModalGeneralError && (
                <div className="rounded-lg bg-red-950/20 border border-red-900/30 p-3 text-xs text-red-400">
                  {passwordModalGeneralError}
                </div>
              )}

              {/* Current Password */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Current Password
                </label>
                <div className="relative mt-1.5">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    required
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value);
                      if (currentPasswordError) setCurrentPasswordError(null);
                    }}
                    className="block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3.5 py-2 pr-10 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-white"
                    tabIndex={-1}
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {currentPasswordError && (
                  <p className="mt-1.5 text-xs text-red-500">
                    {currentPasswordError}
                  </p>
                )}
              </div>

              {/* New Password */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  New Password
                </label>
                <div className="relative mt-1.5">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3.5 py-2 pr-10 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-white"
                    tabIndex={-1}
                  >
                    {showNewPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <PasswordChecklist password={newPassword} className="mt-2.5" />
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Confirm New Password
                </label>
                <div className="relative mt-1.5">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3.5 py-2 pr-10 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm"
                    placeholder="Repeat new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-white"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                  <p className="mt-1.5 text-xs text-red-500">
                    Passwords don&apos;t match
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-neutral-800/80">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsChangePasswordOpen(false)}
                  className="border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-900 h-9 px-4 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isUpdatingPassword || !isPasswordReady}
                  className="bg-white text-neutral-950 hover:bg-neutral-200 font-semibold h-9 px-5 text-xs"
                >
                  {isUpdatingPassword ? "Updating..." : "Change password"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
