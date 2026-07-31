'use client';

import { useState } from "react";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { createClient } from "@/utils/supabase/client";
import { User, Camera, Shield, Save, Key, Eye, EyeOff } from "lucide-react";

export default function LandlordProfilePage() {
  const utils = trpc.useUtils();

  // Queries & Mutations
  const { data: user } = trpc.auth.me.useQuery();
  
  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      setProfileSuccess("Profile updated successfully!");
      setProfileError(null);
      setTimeout(() => setProfileSuccess(null), 3000);
    },
    onError: (err) => {
      setProfileError(err.message);
      setProfileSuccess(null);
    },
  });

  const getAvatarUploadUrl = trpc.auth.getAvatarUploadUrl.useMutation();
  
  const updateAvatarUrl = trpc.auth.updateAvatarUrl.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      setAvatarSuccess("Profile picture updated!");
      setTimeout(() => setAvatarSuccess(null), 3000);
    },
  });

  // State
  const [fullName, setFullName] = useState("");
  const [isProfileInitialized, setIsProfileInitialized] = useState(false);
  
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Avatar Upload State
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState<string | null>(null);

  // Password State
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Initialize profile form once data is loaded
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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarError(null);
    setAvatarSuccess(null);

    // Limit to 5MB
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError("File size exceeds 5MB limit.");
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setAvatarError("Only JPG, PNG, and WEBP image files are allowed.");
      return;
    }

    setUploadingAvatar(true);

    try {
      // 1. Get signed upload URL and target public URL from server
      const { signedUrl, publicUrl } = await getAvatarUploadUrl.mutateAsync({
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
        throw new Error("Failed to upload image to storage.");
      }

      // 3. Save new avatar URL to user record in DB
      await updateAvatarUrl.mutateAsync({ avatarUrl: publicUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred during file upload.";
      setAvatarError(message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setUpdatingPassword(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw new Error(error.message);
      }

      setPasswordSuccess("Password updated successfully!");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update password.";
      setPasswordError(message);
    } finally {
      setUpdatingPassword(false);
    }
  };

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <BackButton href="/landlord" label="Back to Dashboard" />

      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Account Settings</h1>
        <p className="text-neutral-400 mt-1 text-sm">
          Manage your personal details, profile picture, and security preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: Avatar Management */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-6 backdrop-blur-sm flex flex-col items-center justify-center text-center space-y-4">
          <div className="relative group">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.fullName}
                className="w-32 h-32 rounded-full object-cover border-2 border-neutral-800 group-hover:border-neutral-600 transition-colors"
              />
            ) : (
              <div className="w-32 h-32 rounded-full bg-neutral-900 border-2 border-neutral-800 flex items-center justify-center text-neutral-400 group-hover:border-neutral-600 transition-colors">
                <User className="w-12 h-12" />
              </div>
            )}
            
            <label className="absolute bottom-0 right-0 p-2 rounded-full bg-white text-neutral-950 hover:bg-neutral-200 border border-neutral-800 shadow-md cursor-pointer transition-transform hover:scale-105">
              <Camera className="w-4 h-4" />
              <input
                type="file"
                accept="image/jpeg, image/png, image/webp"
                onChange={handleAvatarUpload}
                disabled={uploadingAvatar}
                className="sr-only"
              />
            </label>
          </div>

          <div className="space-y-1">
            <h2 className="font-bold text-white text-lg">{user?.fullName}</h2>
            <p className="text-xs text-neutral-500 capitalize">{user?.role}</p>
          </div>

          <p className="text-xs text-neutral-500 leading-relaxed">
            Upload a JPG, PNG or WEBP image. Max size 5MB.
          </p>

          {uploadingAvatar && (
            <p className="text-xs text-neutral-400 animate-pulse">Uploading profile picture...</p>
          )}

          {avatarError && (
            <div className="rounded bg-red-950/20 border border-red-900/30 p-2 text-xs text-red-400 w-full">
              {avatarError}
            </div>
          )}

          {avatarSuccess && (
            <div className="rounded bg-green-950/20 border border-green-900/30 p-2 text-xs text-green-400 w-full">
              {avatarSuccess}
            </div>
          )}
        </div>

        {/* Right Column: Profile and Security details */}
        <div className="md:col-span-2 space-y-6">
          {/* General Information Card */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-6 backdrop-blur-sm space-y-6">
            <div className="flex items-center space-x-2 border-b border-neutral-850 pb-3">
              <User className="w-5 h-5 text-neutral-400" />
              <h2 className="text-lg font-bold text-white">General Information</h2>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              {profileSuccess && (
                <div className="rounded bg-green-950/20 border border-green-900/30 p-3 text-sm text-green-400">
                  {profileSuccess}
                </div>
              )}
              {profileError && (
                <div className="rounded bg-red-950/20 border border-red-900/30 p-3 text-sm text-red-400">
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
                  className="mt-1.5 block w-full rounded-lg border border-neutral-850 bg-neutral-950 px-4 py-2 text-neutral-400 cursor-not-allowed text-sm h-10"
                />
                <span className="text-[11px] text-neutral-500 mt-1 block">
                  Email changes are disabled at this time.
                </span>
              </div>

              <div>
                <label htmlFor="fullName" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={updateProfile.isPending}
                  className="bg-white text-neutral-950 hover:bg-neutral-200 font-semibold h-10 px-6 flex items-center space-x-2 text-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>{updateProfile.isPending ? "Saving..." : "Save Profile"}</span>
                </Button>
              </div>
            </form>
          </div>

          {/* Security & Password Card */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-6 backdrop-blur-sm space-y-6">
            <div className="flex items-center space-x-2 border-b border-neutral-850 pb-3">
              <Shield className="w-5 h-5 text-neutral-400" />
              <h2 className="text-lg font-bold text-white">Security &amp; Password</h2>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              {passwordSuccess && (
                <div className="rounded bg-green-950/20 border border-green-900/30 p-3 text-sm text-green-400">
                  {passwordSuccess}
                </div>
              )}
              {passwordError && (
                <div className="rounded bg-red-950/20 border border-red-900/30 p-3 text-sm text-red-400">
                  {passwordError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="newPassword" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    New Password
                  </label>
                  <div className="mt-1.5 relative">
                    <input
                      id="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="block w-full rounded-lg border border-neutral-800 bg-neutral-900 pl-4 pr-10 py-2 text-white placeholder-neutral-600 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-white transition-colors"
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="confirmPassword" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Confirm Password
                  </label>
                  <div className="mt-1.5 relative">
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="block w-full rounded-lg border border-neutral-800 bg-neutral-900 pl-4 pr-10 py-2 text-white placeholder-neutral-600 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700 text-sm h-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-white transition-colors"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={updatingPassword}
                  className="bg-neutral-900 hover:bg-neutral-800 text-white font-semibold border border-neutral-800 h-10 px-6 flex items-center space-x-2 text-sm"
                >
                  <Key className="w-4 h-4" />
                  <span>{updatingPassword ? "Updating..." : "Update Password"}</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
