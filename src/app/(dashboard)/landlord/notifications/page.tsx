'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import {
  CreditCard,
  FileText,
  MessageSquare,
  UserCheck,
  Check,
  Inbox,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTitleRow } from "@/components/layout/PageTitleRow";
import { PageContainer } from "@/components/layout/PageContainer";
import { getLagosYMD, formatDateGB } from "@/lib/billing";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  relatedType: string | null;
  relatedId: string | null;
  readAt: string | Date | null;
  createdAt: string | Date;
  unitNumber?: string | null;
  propertyName?: string | null;
  quote?: string | null;
}

function getNotificationIconConfig(type: string) {
  switch (type) {
    case "payment_logged":
      return {
        icon: <CreditCard className="w-4 h-4" />,
        color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      };
    case "payment_flagged":
    case "payment_rejected":
      return {
        icon: <AlertCircle className="w-4 h-4" />,
        color: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      };
    case "payment_confirmed":
    case "payment_resolved":
      return {
        icon: <Check className="w-4 h-4" />,
        color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      };
    case "invite_redeemed":
      return {
        icon: <UserCheck className="w-4 h-4" />,
        color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
      };
    case "message_received":
      return {
        icon: <MessageSquare className="w-4 h-4" />,
        color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      };
    case "lease_created":
    default:
      return {
        icon: <FileText className="w-4 h-4" />,
        color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      };
  }
}

function getNotificationSentence(n: NotificationItem): string {
  let s = n.body.trim();
  s = s.replace(/\s+for\s+unit\s+.*$/i, "");
  s = s.replace(/\s+at\s+unit\s+.*$/i, "");
  s = s.replace(/[.,:;]+$/, "");
  return s;
}

function getNotificationSubtitle(n: NotificationItem): string | null {
  const parts: string[] = [];
  if (n.unitNumber && n.propertyName) {
    parts.push(`Unit ${n.unitNumber} · ${n.propertyName}`);
  } else if (n.propertyName) {
    parts.push(n.propertyName);
  } else if (n.unitNumber) {
    parts.push(`Unit ${n.unitNumber}`);
  }

  if (n.quote) {
    const quoteText = `"${n.quote}"`;
    if (parts.length > 0) {
      return `${parts.join(" · ")} — ${quoteText}`;
    }
    return quoteText;
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

function getNotificationDateGroup(dateInput: Date | string, now = new Date()): "Today" | "Yesterday" | "Earlier" {
  const target = getLagosYMD(dateInput);
  const current = getLagosYMD(now);
  const d1 = Date.UTC(target.year, target.month - 1, target.day);
  const d2 = Date.UTC(current.year, current.month - 1, current.day);
  const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return "Earlier";
}

function formatNotificationTime(dateInput: Date | string, group: "Today" | "Yesterday" | "Earlier"): string {
  if (group === "Earlier") {
    return formatDateGB(dateInput);
  }
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export default function LandlordNotificationsPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const { data: notifications, isLoading } = trpc.notifications.listReceived.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => utils.notifications.listReceived.invalidate(),
  });

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => utils.notifications.listReceived.invalidate(),
  });

  const displayed = (notifications ?? []).filter((n) =>
    filter === "unread" ? !n.readAt : true
  );

  const unreadCount = (notifications ?? []).filter((n) => !n.readAt).length;

  const handleClick = async (n: NotificationItem) => {
    if (!n.readAt) {
      await markRead.mutateAsync({ notificationId: n.id });
    }

    // Deep-link navigation
    if (n.relatedId) {
      if (n.relatedType === "payment") {
        try {
          const info = await utils.client.payments.getRedirectInfo.query({ paymentId: n.relatedId });
          if (info) {
            router.push(`/landlord/properties/${info.propertyId}/units/${info.unitId}?paymentId=${n.relatedId}`);
          }
        } catch { /* ignore */ }
      } else if (n.relatedType === "conversation") {
        try {
          const info = await utils.client.conversations.getRedirectInfo.query({ conversationId: n.relatedId });
          if (info) {
            router.push(`/landlord/properties/${info.propertyId}/units/${info.unitId}?tab=chat`);
          }
        } catch { /* ignore */ }
      } else if (n.relatedType === "lease") {
        try {
          const info = await utils.client.leases.getRedirectInfo.query({ leaseId: n.relatedId });
          if (info) {
            router.push(`/landlord/properties/${info.propertyId}/units/${info.unitId}`);
          }
        } catch { /* ignore */ }
      } else if (n.relatedType === "unit") {
        try {
          const info = await utils.client.units.getRedirectInfo.query({ unitId: n.relatedId });
          if (info) {
            router.push(`/landlord/properties/${info.propertyId}/units/${info.unitId}`);
          }
        } catch { /* ignore */ }
      }
    }
  };

  // Group notifications into Today, Yesterday, Earlier
  const groupedNotifications = (() => {
    const todayList: NotificationItem[] = [];
    const yesterdayList: NotificationItem[] = [];
    const earlierList: NotificationItem[] = [];

    displayed.forEach((n) => {
      const g = getNotificationDateGroup(n.createdAt);
      if (g === "Today") todayList.push(n);
      else if (g === "Yesterday") yesterdayList.push(n);
      else earlierList.push(n);
    });

    const groups: { label: "Today" | "Yesterday" | "Earlier"; items: NotificationItem[] }[] = [];
    if (todayList.length > 0) groups.push({ label: "Today", items: todayList });
    if (yesterdayList.length > 0) groups.push({ label: "Yesterday", items: yesterdayList });
    if (earlierList.length > 0) groups.push({ label: "Earlier", items: earlierList });
    return groups;
  })();

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <PageHeader title="Notifications" />

      <PageContainer className="space-y-6">
        <PageTitleRow
          title="Your notifications"
          description="Payments, lease events and messages from your tenants."
          actions={
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Segmented Toggle: Desktop */}
              <div className="hidden sm:flex rounded-lg bg-neutral-900 border border-neutral-800 p-0.5 text-xs">
                {(["all", "unread"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "px-3 py-1.5 rounded-md font-medium capitalize transition-all",
                      filter === f
                        ? "bg-white text-neutral-950 shadow"
                        : "text-neutral-400 hover:text-white"
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {/* Desktop Mark all read outline button */}
              {unreadCount > 0 && (
                <Button
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  variant="outline"
                  className="hidden sm:flex border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-900 h-8 px-3 text-xs items-center gap-1.5 font-medium"
                >
                  <Check className="w-3.5 h-3.5" />
                  Mark all read
                </Button>
              )}

              {/* Mobile icon-only Mark all read button */}
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="sm:hidden w-8 h-8 rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-800 flex items-center justify-center shrink-0"
                  aria-label="Mark all read"
                  title="Mark all read"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
            </div>
          }
        />

        {/* Mobile Segmented Toggle (under heading) */}
        <div className="sm:hidden flex rounded-lg bg-neutral-900 border border-neutral-800 p-0.5 text-xs w-full">
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "flex-1 py-1.5 rounded-md font-medium capitalize text-center transition-all",
                filter === f
                  ? "bg-white text-neutral-950 shadow"
                  : "text-neutral-400 hover:text-white"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {/* List Content */}
        {isLoading ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 divide-y divide-neutral-800/60 p-1">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3.5 p-4">
                  <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <Skeleton className="h-4 w-56" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                  <Skeleton className="h-3 w-12 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        ) : displayed.length === 0 ? (
          /* Empty States */
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/20 py-16 px-4 text-center">
            <div className="max-w-md mx-auto space-y-2">
              <Inbox className="w-10 h-10 text-neutral-500 mx-auto mb-2" />
              <h3 className="text-base font-semibold text-white">
                {filter === "unread" ? "You're all caught up." : "No notifications yet."}
              </h3>
              <p className="text-xs text-neutral-400">
                {filter === "unread"
                  ? "You have no unread notifications."
                  : "Payments, lease events, and messages will appear here."}
              </p>
            </div>
          </div>
        ) : (
          /* Grouped Lists (Today, Yesterday, Earlier) */
          <div className="space-y-6">
            {groupedNotifications.map(({ label, items }) => (
              <div key={label} className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 px-1">
                  {label}
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 divide-y divide-neutral-800/60 overflow-hidden">
                  {items.map((n) => {
                    const isUnread = !n.readAt;
                    const iconConfig = getNotificationIconConfig(n.type);
                    const sentence = getNotificationSentence(n);
                    const subtitle = getNotificationSubtitle(n);
                    const timeFormatted = formatNotificationTime(n.createdAt, label);

                    return (
                      <div
                        key={n.id}
                        onClick={() => handleClick(n)}
                        className="flex items-center gap-3.5 p-4 hover:bg-neutral-850/50 cursor-pointer transition-colors"
                      >
                        {/* 36px rounded-square icon tinted by type */}
                        <div
                          className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border",
                            iconConfig.color
                          )}
                        >
                          {iconConfig.icon}
                        </div>

                        {/* Text: Sentence + Muted Subtitle */}
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p
                            className={cn(
                              "text-sm leading-snug truncate",
                              isUnread ? "text-white font-medium" : "text-neutral-400 font-normal"
                            )}
                            title={sentence}
                          >
                            {sentence}
                          </p>
                          {subtitle && (
                            <p className="text-xs text-neutral-500 truncate" title={subtitle}>
                              {subtitle}
                            </p>
                          )}
                        </div>

                        {/* Time & Unread Blue Dot */}
                        <div className="flex items-center gap-2 shrink-0 text-xs">
                          <span
                            className={cn(
                              isUnread ? "text-neutral-300 font-medium" : "text-neutral-500"
                            )}
                          >
                            {timeFormatted}
                          </span>
                          {isUnread && (
                            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </PageContainer>
    </div>
  );
}
