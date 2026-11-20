'use client';

import React from "react";
import { RefreshCw, Copy, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { useToast } from "@/components/ui/toast";
import { formatDateGB } from "@/lib/billing";

export interface InviteCardProps {
  type: "code" | "in_app";
  tenantName: string;
  tenantEmail: string;
  expiresAt: Date | string;
  isExpired: boolean;
  code?: string;
  hasPayments?: boolean;
  onNewCode?: () => void;
  onEditTenant?: () => void;
  onCancelInvite?: () => void;
  onResendInvite?: () => void;
  isLoading?: boolean;
  className?: string;
}

export function InviteCard({
  type,
  tenantName,
  tenantEmail,
  expiresAt,
  isExpired,
  code,
  hasPayments = false,
  onNewCode,
  onEditTenant,
  onCancelInvite,
  onResendInvite,
  isLoading = false,
  className,
}: InviteCardProps) {
  const { toast } = useToast();

  const handleCopyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast("Code copied", "success");
    } catch {
      toast("Failed to copy code", "error");
    }
  };

  const handleCopyLink = async () => {
    if (!code) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/signup?code=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied", "success");
    } catch {
      toast("Failed to copy link", "error");
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const signupLink = code ? `${origin}/signup?code=${code}` : "";

  // Build ActionMenu items
  const menuItems: ActionMenuItem[] = [];

  if (type === "code") {
    if (!isExpired && onNewCode) {
      menuItems.push({
        label: "New code",
        icon: <RefreshCw className="w-4 h-4" />,
        onClick: onNewCode,
      });
    }
    if (onEditTenant) {
      menuItems.push({
        label: "Edit tenant details",
        icon: <Pencil className="w-4 h-4" />,
        onClick: onEditTenant,
      });
    }
    if (onCancelInvite) {
      menuItems.push({
        label: "Cancel invite",
        icon: <Trash2 className="w-4 h-4" />,
        variant: "danger",
        onClick: onCancelInvite,
        disabled: hasPayments,
        disabledTooltip: "This lease has payments. Delete them first.",
      });
    }
  } else {
    // in_app
    if (!isExpired && onResendInvite) {
      menuItems.push({
        label: "Resend invitation",
        icon: <RefreshCw className="w-4 h-4" />,
        onClick: onResendInvite,
      });
    }
    if (onCancelInvite) {
      menuItems.push({
        label: "Cancel invitation",
        icon: <Trash2 className="w-4 h-4" />,
        variant: "danger",
        onClick: onCancelInvite,
      });
    }
  }

  const title =
    type === "code"
      ? isExpired
        ? "Invite code expired"
        : `Invite sent to ${tenantName}`
      : isExpired
      ? "Invitation expired"
      : `Invite sent to ${tenantName}`;

  const subtitle =
    type === "code"
      ? isExpired
        ? `${tenantName} · ${tenantEmail} · expired ${formatDateGB(expiresAt)}`
        : `${tenantEmail} · expires ${formatDateGB(expiresAt)}`
      : isExpired
      ? `${tenantName} · ${tenantEmail} · expired ${formatDateGB(expiresAt)}`
      : `${tenantEmail} · expires ${formatDateGB(expiresAt)}`;

  return (
    <div
      className={`rounded-xl border border-neutral-800 bg-neutral-900/20 p-5 sm:p-6 space-y-4 ${
        className || ""
      }`}
    >
      {/* Header row: Title & Subtitle on left, Button + ⋯ ActionMenu on right */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-white truncate">
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-neutral-400 truncate">
            {subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {type === "code" && isExpired && onNewCode && (
            <Button
              type="button"
              onClick={onNewCode}
              disabled={isLoading}
              variant="outline"
              size="sm"
              className="border-neutral-800 text-xs h-8 px-2.5 sm:px-3 text-neutral-200 hover:text-white hover:bg-neutral-800"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              <span>New code</span>
            </Button>
          )}

          {type === "in_app" && isExpired && onResendInvite && (
            <Button
              type="button"
              onClick={onResendInvite}
              disabled={isLoading}
              variant="outline"
              size="sm"
              className="border-neutral-800 text-xs h-8 px-2.5 sm:px-3 text-neutral-200 hover:text-white hover:bg-neutral-800"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              <span>Resend invitation</span>
            </Button>
          )}

          {menuItems.length > 0 && <ActionMenu items={menuItems} />}
        </div>
      </div>

      {/* Code and Link row (only when type === "code" and not expired) */}
      {type === "code" && !isExpired && code && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Invite Code */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 flex items-center justify-between gap-3 min-w-0">
            <div className="min-w-0">
              <span className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                Invite Code
              </span>
              <span className="font-mono text-base font-bold text-white block truncate tracking-wider">
                {code}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyCode}
              className="shrink-0 h-8 w-8 p-0 border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800"
              aria-label="Copy code"
              title="Copy code"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>

          {/* Signup Link */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 flex items-center justify-between gap-3 min-w-0">
            <div className="min-w-0">
              <span className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                Signup Link
              </span>
              <span
                className="text-xs text-neutral-400 block truncate"
                title={signupLink}
              >
                {signupLink}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="shrink-0 h-8 w-8 p-0 border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800"
              aria-label="Copy link"
              title="Copy link"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
