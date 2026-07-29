'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import {
  Bell,
  CreditCard,
  FileText,
  MessageSquare,
  UserCheck,
  Check,
  Inbox,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

const typeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  payment_logged: {
    label: "Payment Logged",
    icon: <CreditCard className="w-4 h-4" />,
    color: "text-emerald-400 bg-emerald-950/30 border-emerald-900/40",
  },
  payment_confirmed: {
    label: "Payment Confirmed",
    icon: <CreditCard className="w-4 h-4" />,
    color: "text-emerald-400 bg-emerald-950/30 border-emerald-900/40",
  },
  payment_rejected: {
    label: "Payment Rejected",
    icon: <CreditCard className="w-4 h-4" />,
    color: "text-rose-400 bg-rose-950/30 border-rose-900/40",
  },
  payment_flagged: {
    label: "Payment Disputed",
    icon: <CreditCard className="w-4 h-4" />,
    color: "text-amber-400 bg-amber-950/30 border-amber-900/40",
  },
  payment_resolved: {
    label: "Dispute Resolved",
    icon: <CreditCard className="w-4 h-4" />,
    color: "text-emerald-400 bg-emerald-950/30 border-emerald-900/40",
  },
  invite_redeemed: {
    label: "Invite Redeemed",
    icon: <UserCheck className="w-4 h-4" />,
    color: "text-indigo-400 bg-indigo-950/30 border-indigo-900/40",
  },
  lease_created: {
    label: "Lease Created",
    icon: <FileText className="w-4 h-4" />,
    color: "text-purple-400 bg-purple-950/30 border-purple-900/40",
  },
  message_received: {
    label: "New Message",
    icon: <MessageSquare className="w-4 h-4" />,
    color: "text-sky-400 bg-sky-950/30 border-sky-900/40",
  },
};

export default function LandlordNotificationsPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const { data: notifications, isLoading } = trpc.notifications.listReceived.useQuery(undefined, {
    refetchInterval: 15000,
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

  const handleClick = async (n: (typeof displayed)[0]) => {
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
      }
    }
  };

  const cfg = (type: string) =>
    typeConfig[type] ?? {
      label: type,
      icon: <Bell className="w-4 h-4" />,
      color: "text-neutral-400 bg-neutral-900/30 border-neutral-800/40",
    };

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center space-x-3">
            <Bell className="w-7 h-7 text-neutral-400" />
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-full bg-red-500 text-[11px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </h1>
          <p className="text-neutral-400 mt-1 text-sm">
            Tenant payments, invite redemptions, messages and lease events.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Filter toggle */}
          <div className="flex rounded-lg bg-neutral-900 border border-neutral-800 p-0.5 text-xs">
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

          {unreadCount > 0 && (
            <Button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              variant="outline"
              className="border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-900 h-8 px-3 text-xs flex items-center space-x-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Mark all read</span>
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="py-20 text-center text-neutral-500 animate-pulse text-sm">
          Loading notifications...
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/10 p-16 text-center text-neutral-500 space-y-3">
          <Inbox className="w-12 h-12 mx-auto opacity-40 text-neutral-400" />
          <p className="text-base font-semibold text-neutral-300">
            {filter === "unread" ? "No unread notifications" : "No notifications yet"}
          </p>
          <p className="text-xs max-w-xs mx-auto">
            {filter === "unread"
              ? "You are all caught up."
              : "Tenant activity like payments and lease events will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((n) => {
            const c = cfg(n.type);
            const isUnread = !n.readAt;
            const formattedDate = new Date(n.createdAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                className={cn(
                  "group flex items-start space-x-4 p-4 rounded-2xl border cursor-pointer transition-all",
                  isUnread
                    ? "bg-neutral-900/30 border-neutral-800/60 hover:border-neutral-700"
                    : "bg-neutral-950/20 border-neutral-900 hover:border-neutral-800 opacity-70 hover:opacity-100"
                )}
              >
                {/* Icon */}
                <div className={cn("flex-shrink-0 p-2 rounded-xl border text-sm", c.color)}>
                  {c.icon}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2 min-w-0">
                      <p className={cn("text-sm text-white truncate", isUnread ? "font-semibold" : "font-normal")}>
                        {n.title}
                      </p>
                      <span className={cn("flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold border", c.color)}>
                        {c.label}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      {isUnread && (
                        <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                      )}
                      <span className="text-[11px] text-neutral-500 font-sans whitespace-nowrap">{formattedDate}</span>
                    </div>
                  </div>
                  <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{n.body}</p>
                </div>

                {/* Arrow hint */}
                {n.relatedId && (
                  <ExternalLink className="w-4 h-4 text-neutral-600 group-hover:text-neutral-400 flex-shrink-0 mt-0.5 transition-colors" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
