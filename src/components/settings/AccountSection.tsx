'use client';

import { useState } from "react";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalField } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/utils/supabase/client";
import { Shield, Pencil, Key, Eye, EyeOff, Loader2 } from "lucide-react";
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
      <div className="rounded-xl border border-border bg-card/40 p-6 backdrop-blur-sm space-y-6">
        <div className="flex items-center space-x-2 border-b border-border pb-3">
          <Shield className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-bold text-foreground">Account</h2>
        </div>

        <div className="divide-y divide-border">
          {/* Name Row */}
          <div className="py-4 first:pt-0 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Full Name
              </span>
              <span className="text-foreground font-medium text-sm block">
                {user.fullName || "—"}
              </span>
            </div>
            <button
              type="button"
              onClick={handleOpenEditName}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Edit name"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>

          {/* Email Row */}
          <div className="py-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Email Address
              </span>
              <span className="text-foreground/80 font-medium text-sm block">
                {user.email || "—"}
              </span>
            </div>
            <span className="text-xs text-subtle-foreground font-medium">Read-only</span>
          </div>

          {/* Password Row */}
          <div className="py-4 last:pb-0 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Password
              </span>
              <span className="text-muted-foreground text-sm block">••••••••••••</span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleOpenChangePassword}
              className="border-border text-foreground/80 hover:text-foreground hover:bg-muted h-9 px-3.5 text-xs flex items-center space-x-1.5"
            >
              <Key className="w-4 h-4" />
              <span>Change password</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Edit Name Modal */}
      <Modal
        open={isEditNameOpen}
        onOpenChange={setIsEditNameOpen}
        size="md"
        isSaving={updateProfile.isPending}
      >
        <ModalHeader
          title="Edit name"
          onClose={() => setIsEditNameOpen(false)}
          isSaving={updateProfile.isPending}
        />
        <form onSubmit={handleSaveName} className="flex-1 flex flex-col min-h-0">
          <ModalBody>
            {nameError && (
              <div className="rounded-lg bg-destructive-tint border border-destructive/30 p-3 text-xs text-destructive">
                {nameError}
              </div>
            )}

            <ModalField label="Full Name" htmlFor="edit-full-name" required>
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
                className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 text-sm"
              />
              <div className="mt-1.5 flex justify-end">
                <span
                  className={cn(
                    "text-xs transition-colors",
                    nameValue.length >= 40
                      ? "text-destructive font-medium"
                      : "text-muted-foreground"
                  )}
                >
                  {nameValue.length}/40
                </span>
              </div>
            </ModalField>
          </ModalBody>

          <ModalFooter>
            <div className="grid grid-cols-2 gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditNameOpen(false)}
                disabled={updateProfile.isPending}
                className="w-full h-12 rounded-lg text-[15px] font-semibold border-border hover:bg-muted"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!nameValue.trim() || updateProfile.isPending}
                className="w-full h-12 rounded-lg text-[15px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2"
              >
                {updateProfile.isPending && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                Save
              </Button>
            </div>
          </ModalFooter>
        </form>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        open={isChangePasswordOpen}
        onOpenChange={setIsChangePasswordOpen}
        size="md"
        isSaving={isUpdatingPassword}
      >
        <ModalHeader
          title="Change password"
          onClose={() => setIsChangePasswordOpen(false)}
          isSaving={isUpdatingPassword}
        />
        <form onSubmit={handleChangePassword} className="flex-1 flex flex-col min-h-0">
          <ModalBody>
            {passwordModalGeneralError && (
              <div className="rounded-lg bg-destructive-tint border border-destructive/30 p-3 text-xs text-destructive">
                {passwordModalGeneralError}
              </div>
            )}

            {/* Current Password */}
            <ModalField label="Current Password" required>
              <div className="relative">
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  required
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    if (currentPasswordError) setCurrentPasswordError(null);
                  }}
                  className="block w-full h-12 rounded-lg border border-input bg-card px-4 pr-12 text-foreground placeholder:text-subtle-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 text-sm"
                  placeholder="Enter current password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showCurrentPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {currentPasswordError && (
                <p className="mt-1.5 text-xs text-destructive">
                  {currentPasswordError}
                </p>
              )}
            </ModalField>

            {/* New Password */}
            <ModalField label="New Password" required>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="block w-full h-12 rounded-lg border border-input bg-card px-4 pr-12 text-foreground placeholder:text-subtle-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 text-sm"
                  placeholder="Enter new password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showNewPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              <PasswordChecklist password={newPassword} className="mt-2.5" />
            </ModalField>

            {/* Confirm New Password */}
            <ModalField label="Confirm New Password" required>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full h-12 rounded-lg border border-input bg-card px-4 pr-12 text-foreground placeholder:text-subtle-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 text-sm"
                  placeholder="Repeat new password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                <p className="mt-1.5 text-xs text-destructive">
                  Passwords don&apos;t match
                </p>
              )}
            </ModalField>
          </ModalBody>

          <ModalFooter>
            <div className="grid grid-cols-2 gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsChangePasswordOpen(false)}
                disabled={isUpdatingPassword}
                className="w-full h-12 rounded-lg text-[15px] font-semibold border-border hover:bg-muted"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isUpdatingPassword || !isPasswordReady}
                className="w-full h-12 rounded-lg text-[15px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2"
              >
                {isUpdatingPassword && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                Change password
              </Button>
            </div>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
