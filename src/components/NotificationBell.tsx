'use client';

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
  Inbox
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatWidget } from "@/components/ChatWidgetContext";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "./ui/modal";

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
  const bellButtonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const [selectedNotice, setSelectedNotice] = useState<MergedNotificationItem | null>(null);

  const utils = trpc.useContext();
  const chatWidget = useChatWidget();

  // Queries
  const { data: currentUser } = trpc.auth.me.useQuery();
  const systemNotificationsQuery = trpc.notifications.listReceived.useQuery(undefined, {
    enabled: !!currentUser,
    refetchInterval: 30_000, // Poll every 30s to capture live notifications
  });
  const receivedNoticesQuery = trpc.notices.listReceived.useQuery(undefined, {
    enabled: !!currentUser && currentUser.role === "tenant",
    refetchInterval: 30_000, // Poll notices every 30s for tenants
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

  // Mount flag — needed for createPortal (avoids SSR mismatch)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close dropdown on outside click — checks both the portal div and the bell button
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const isInsideDropdown = dropdownRef.current?.contains(target);
      const isInsideBell = bellButtonRef.current?.contains(target);
      if (!isInsideDropdown && !isInsideBell) {
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

  // Calculate fixed dropdown position from the bell button rect
  const handleBellToggle = () => {
    if (!isOpen && bellButtonRef.current) {
      const rect = bellButtonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setIsOpen((prev) => !prev);
  };

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
          chatWidget.open();
        } else {
          try {
            const redirectInfo = await utils.client.conversations.getRedirectInfo.query({ conversationId: item.relatedId });
            if (redirectInfo) {
              chatWidget.open(redirectInfo.unitId);
            }
          } catch (e) {
            console.error("Chat redirect query failed", e);
          }
        }
      } else if (item.relatedType === "lease") {
        if (userRole === "tenant") {
          router.push(`/tenant?leaseId=${item.relatedId}`);
        } else {
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
        return <Megaphone className="w-4 h-4 text-warning" />;
      case "message_received":
        return <MessageSquare className="w-4 h-4 text-primary" />;
      case "payment_logged":
      case "payment_confirmed":
      case "payment_rejected":
      case "payment_flagged":
      case "payment_resolved":
        return <CreditCard className="w-4 h-4 text-success" />;
      case "lease_expiry":
      case "lease_created":
        return <FileText className="w-4 h-4 text-kpi-navy" />;
      case "invite_redeemed":
        return <UserCheck className="w-4 h-4 text-kpi-gold" />;
      default:
        return <Bell className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const dropdownContent = (
    <div
      ref={dropdownRef}
      style={{ top: dropdownPos.top, right: dropdownPos.right }}
      className="fixed w-80 sm:w-96 rounded-2xl border border-border bg-card p-4 shadow-2xl z-[9999] animate-in fade-in slide-in-from-top-3 duration-200"
    >
      <div className="flex items-center justify-between border-b border-border pb-3 mb-3">
        <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center space-x-1 font-medium transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Mark all read</span>
          </button>
        )}
      </div>

      {/* Notification List */}
      <div className="max-h-[350px] overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
        {mergedNotifications.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
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
                  ? "bg-muted/40 border-border/40 hover:bg-muted/60" 
                  : "hover:bg-muted/20 opacity-75"
              )}
            >
              <div className="flex-shrink-0 mt-0.5 p-1.5 bg-muted rounded-lg border border-border">
                {getIcon(item.type)}
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn("text-xs text-foreground", item.readAt === null ? "font-semibold" : "font-normal")}>
                  {item.title}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                  {item.body}
                </p>
                <div className="flex items-center space-x-2 mt-1.5">
                  {item.senderName && (
                    <span className="text-[10px] text-muted-foreground truncate flex items-center space-x-1">
                      <span className="font-medium text-foreground/80">{item.senderName}</span>
                    </span>
                  )}
                  <span className="text-[9px] text-subtle-foreground font-medium font-sans ml-auto">
                    {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Bell Button */}
      <button
        ref={bellButtonRef}
        onClick={handleBellToggle}
        className="relative p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-all focus:outline-none"
        aria-label="Open notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground ring-2 ring-background">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown — rendered as a portal to escape any parent stacking context */}
      {isOpen && mounted && createPortal(dropdownContent, document.body)}

      {/* Notice Detail Dialog Modal */}
      {selectedNotice && (
        <Modal
          open={!!selectedNotice}
          onOpenChange={(open) => {
            if (!open) setSelectedNotice(null);
          }}
          size="md"
        >
          <ModalHeader
            title={selectedNotice.title}
            description="Notice from Landlord"
            onClose={() => setSelectedNotice(null)}
          />
          <ModalBody>
            <div className="bg-muted/30 rounded-xl border border-border p-4 min-h-[120px] text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
              {selectedNotice.body}
            </div>

            <div className="flex items-center space-x-3 pt-2 text-xs text-muted-foreground">
              <div>
                <p className="font-semibold text-foreground">{selectedNotice.senderName}</p>
                <p className="text-[11px] text-muted-foreground">Property Landlord</p>
              </div>
              <span className="text-[11px] text-subtle-foreground ml-auto">
                {new Date(selectedNotice.createdAt).toLocaleDateString()} at {new Date(selectedNotice.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </ModalBody>
          <ModalFooter>
            <button
              type="button"
              onClick={() => setSelectedNotice(null)}
              className="w-full h-12 rounded-lg text-[15px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center transition-colors"
            >
              Close
            </button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}
