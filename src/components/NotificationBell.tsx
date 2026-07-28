'use client';

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/utils/trpc";
import { 
  Bell, 
  Megaphone, 
  MessageSquare, 
  CreditCard, 
  FileText, 
  UserCheck, 
  Check, 
  Inbox, 
  X,
  User
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MergedNotificationItem {
  id: string; // db row id
  source: 'notice' | 'notification';
  type: string; // notice, or notification type
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
  senderName?: string;
  senderAvatar?: string;
  relatedType?: string;
  relatedId?: string;
}

export function NotificationBell() {
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<MergedNotificationItem | null>(null);

  const utils = trpc.useContext();

  // Queries
  const { data: currentUser } = trpc.auth.me.useQuery();
  const systemNotificationsQuery = trpc.notifications.listReceived.useQuery(undefined, {
    enabled: !!currentUser,
    refetchInterval: 10000, // Poll every 10s to capture live notifications
  });
  const receivedNoticesQuery = trpc.notices.listReceived.useQuery(undefined, {
    enabled: !!currentUser && currentUser.role === "tenant",
    refetchInterval: 10000, // Poll notices every 10s for tenants
  });

  // Mutations
  const markNotificationRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.listReceived.invalidate();
    },
  });

  const markNoticeRead = trpc.notices.markRead.useMutation({
    onSuccess: () => {
      utils.notices.listReceived.invalidate();
    },
  });

  const markAllReadMutation = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.listReceived.invalidate();
      utils.notices.listReceived.invalidate();
    },
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Merge the two data sources
  const systemItems = systemNotificationsQuery.data || [];
  const noticeItems = receivedNoticesQuery.data || [];

  const mergedNotifications: MergedNotificationItem[] = [
    ...systemItems.map((n) => ({
      id: n.id,
      source: 'notification' as const,
      type: n.type,
      title: n.title,
      body: n.body,
      readAt: n.readAt ? new Date(n.readAt) : null,
      createdAt: new Date(n.createdAt),
      relatedType: n.relatedType || undefined,
      relatedId: n.relatedId || undefined,
    })),
    ...noticeItems.map((nr) => ({
      id: nr.id,
      source: 'notice' as const,
      type: 'notice',
      title: nr.notice.title,
      body: nr.notice.body,
      readAt: nr.readAt ? new Date(nr.readAt) : null,
      createdAt: new Date(nr.notice.createdAt),
      senderName: nr.notice.landlord.fullName,
      senderAvatar: nr.notice.landlord.avatarUrl || undefined,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const unreadCount = mergedNotifications.filter((n) => n.readAt === null).length;

  // Handle click on notification items
  const handleItemClick = async (item: MergedNotificationItem) => {
    // 1. Mark as read on backend if not already read
    if (item.readAt === null) {
      if (item.source === 'notification') {
        await markNotificationRead.mutateAsync({ notificationId: item.id });
      } else {
        await markNoticeRead.mutateAsync({ recipientId: item.id });
      }
    }

    setIsOpen(false);

    // 2. Deep-linking navigation
    if (item.source === 'notice') {
      setSelectedNotice(item);
    } else if (item.source === 'notification' && item.relatedId) {
      const userRole = currentUser?.role;

      if (item.relatedType === "payment") {
        if (userRole === "tenant") {
          router.push(`/tenant?paymentId=${item.relatedId}`);
        } else {
          // Landlord side: Resolve redirect coordinates first
          try {
            const redirectInfo = await utils.client.payments.getRedirectInfo.query({ paymentId: item.relatedId });
            if (redirectInfo) {
              router.push(`/landlord/properties/${redirectInfo.propertyId}/units/${redirectInfo.unitId}?paymentId=${item.relatedId}`);
            }
          } catch (e) {
            console.error("Redirect query failed", e);
          }
        }
      } else if (item.relatedType === "conversation") {
        if (userRole === "tenant") {
          router.push(`/tenant?tab=chat&conversationId=${item.relatedId}`);
        } else {
          // Landlord side: Resolve redirect coordinates
          try {
            const redirectInfo = await utils.client.conversations.getRedirectInfo.query({ conversationId: item.relatedId });
            if (redirectInfo) {
              router.push(`/landlord/properties/${redirectInfo.propertyId}/units/${redirectInfo.unitId}?tab=chat&conversationId=${item.relatedId}`);
            }
          } catch (e) {
            console.error("Redirect query failed", e);
          }
        }
      } else if (item.relatedType === "lease") {
        if (userRole === "tenant") {
          router.push(`/tenant?leaseId=${item.relatedId}`);
        } else {
          // Landlord side: Resolve redirect coordinates
          try {
            const redirectInfo = await utils.client.leases.getRedirectInfo.query({ leaseId: item.relatedId });
            if (redirectInfo) {
              router.push(`/landlord/properties/${redirectInfo.propertyId}/units/${redirectInfo.unitId}?leaseId=${item.relatedId}`);
            }
          } catch (e) {
            console.error("Redirect query failed", e);
          }
        }
      } else if (item.relatedType === "unit") {
        if (userRole === "landlord") {
          router.push(`/landlord/properties/all/units/${item.relatedId}`);
        }
      }
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "notice":
        return <Megaphone className="w-4 h-4 text-amber-400" />;
      case "message_received":
        return <MessageSquare className="w-4 h-4 text-sky-400" />;
      case "payment_logged":
      case "payment_confirmed":
      case "payment_rejected":
      case "payment_flagged":
      case "payment_resolved":
        return <CreditCard className="w-4 h-4 text-emerald-400" />;
      case "lease_created":
        return <FileText className="w-4 h-4 text-purple-400" />;
      case "invite_redeemed":
        return <UserCheck className="w-4 h-4 text-indigo-400" />;
      default:
        return <Bell className="w-4 h-4 text-neutral-400" />;
    }
  };

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        {/* Bell Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="relative p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-900 transition-all focus:outline-none"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-neutral-950">
              {unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute right-0 mt-2.5 w-80 sm:w-96 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-2xl z-50 animate-in fade-in slide-in-from-top-3 duration-200">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3 mb-3">
              <h2 className="text-sm font-semibold text-white">Notifications</h2>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                  className="text-xs text-neutral-400 hover:text-white flex items-center space-x-1 font-medium transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Mark all read</span>
                </button>
              )}
            </div>

            {/* Notification List */}
            <div className="max-h-[350px] overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent">
              {mergedNotifications.length === 0 ? (
                <div className="py-8 text-center text-neutral-500">
                  <Inbox className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">Your notification feed is empty.</p>
                </div>
              ) : (
                mergedNotifications.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={cn(
                      "flex items-start space-x-3 p-3 rounded-xl cursor-pointer transition-all border border-transparent",
                      item.readAt === null 
                        ? "bg-neutral-900/40 border-neutral-800/40 hover:bg-neutral-900/60" 
                        : "hover:bg-neutral-900/20 opacity-75"
                    )}
                  >
                    <div className="flex-shrink-0 mt-0.5 p-1.5 bg-neutral-900 rounded-lg border border-neutral-850">
                      {getIcon(item.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-xs text-white", item.readAt === null ? "font-semibold" : "font-normal")}>
                        {item.title}
                      </p>
                      <p className="text-[11px] text-neutral-400 mt-0.5 line-clamp-2">
                        {item.body}
                      </p>
                      <div className="flex items-center space-x-2 mt-1.5">
                        {item.senderName && (
                          <span className="text-[10px] text-neutral-500 truncate flex items-center space-x-1">
                            {item.senderAvatar ? (
                              <img src={item.senderAvatar} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
                            ) : (
                              <span className="w-3.5 h-3.5 rounded-full bg-neutral-800 flex items-center justify-center text-[8px]"><User className="w-2 h-2" /></span>
                            )}
                            <span className="font-medium text-neutral-400">{item.senderName}</span>
                          </span>
                        )}
                        <span className="text-[9px] text-neutral-500 font-medium font-sans ml-auto">
                          {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Notice Detail Dialog Modal */}
      {selectedNotice && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setSelectedNotice(null)}
              className="absolute top-4 right-4 p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-900 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-neutral-900 rounded-xl border border-neutral-850">
                <Megaphone className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <span className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">Notice from Landlord</span>
                <h3 className="text-lg font-bold text-white leading-tight">{selectedNotice.title}</h3>
              </div>
            </div>

            <div className="bg-neutral-900/30 rounded-xl border border-neutral-850 p-4 min-h-[120px] text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed">
              {selectedNotice.body}
            </div>

            <div className="flex items-center space-x-3 mt-5 pt-4 border-t border-neutral-900">
              {selectedNotice.senderAvatar ? (
                <img src={selectedNotice.senderAvatar} alt="" className="w-9 h-9 rounded-full object-cover border border-neutral-700" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-neutral-800 flex items-center justify-center border border-neutral-700">
                  <User className="w-4 h-4 text-neutral-400" />
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-white">{selectedNotice.senderName}</p>
                <p className="text-[10px] text-neutral-500">Property Landlord</p>
              </div>
              <span className="text-[10px] text-neutral-500 ml-auto">
                {new Date(selectedNotice.createdAt).toLocaleDateString()} at {new Date(selectedNotice.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
