'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
  AlertCircle,
  Loader2,
  ChevronDown
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTitleRow } from "@/components/layout/PageTitleRow";
import { PageContainer } from "@/components/layout/PageContainer";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { getLagosYMD, formatDateGB } from "@/lib/billing";
import { useChatWidget } from "@/components/ChatWidgetContext";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export interface NotificationItem {
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
        color: "bg-warning-tint text-warning border-warning/20",
      };
    case "payment_flagged":
    case "payment_rejected":
      return {
        icon: <AlertCircle className="w-4 h-4" />,
        color: "bg-destructive-tint text-destructive border-destructive/20",
      };
    case "payment_confirmed":
    case "payment_resolved":
      return {
        icon: <Check className="w-4 h-4" />,
        color: "bg-success-tint text-success border-success/20",
      };
    case "invite_redeemed":
      return {
        icon: <UserCheck className="w-4 h-4" />,
        color: "bg-kpi-gold-tint text-kpi-gold border-kpi-gold/20",
      };
    case "message_received":
      return {
        icon: <MessageSquare className="w-4 h-4" />,
        color: "bg-primary-tint text-primary border-primary/20",
      };
    case "lease_expiry":
    case "lease_created":
    default:
      return {
        icon: <FileText className="w-4 h-4" />,
        color: "bg-primary-tint text-primary border-primary/20",
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

function getNotificationDateGroup(
  dateInput: Date | string,
  now = new Date()
): { key: string; label: string; isTodayOrYesterday: boolean } {
  const target = getLagosYMD(dateInput);
  const current = getLagosYMD(now);
  const d1 = Date.UTC(target.year, target.month - 1, target.day);
  const d2 = Date.UTC(current.year, current.month - 1, current.day);
  const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return { key: "today", label: "Today", isTodayOrYesterday: true };
  }
  if (diffDays === 1) {
    return { key: "yesterday", label: "Yesterday", isTodayOrYesterday: true };
  }
  const monthKey = `${target.year}-${String(target.month).padStart(2, "0")}`;
  const monthLabel = `${MONTH_NAMES[target.month - 1]} ${target.year}`;
  return { key: monthKey, label: monthLabel, isTodayOrYesterday: false };
}

function formatNotificationTime(
  dateInput: Date | string,
  isTodayOrYesterday: boolean
): string {
  if (!isTodayOrYesterday) {
    return formatDateGB(dateInput);
  }
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Lagos",
  }).format(d);
}

interface NotificationsViewProps {
  role: "landlord" | "tenant";
}

export function NotificationsView({ role }: NotificationsViewProps) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const chatWidget = useChatWidget();

  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all"); // "all" or "YYYY-MM"

  // Fetch available distinct months
  const { data: monthsData } = trpc.notifications.months.useQuery(undefined, {
    staleTime: 30_000,
  });

  // Infinite query for cursor pagination (20 items per page)
  const queryInput = useMemo(
    () => ({
      limit: 20,
      filter,
      month: selectedMonth === "all" ? undefined : selectedMonth,
    }),
    [filter, selectedMonth]
  );

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = trpc.notifications.list.useInfiniteQuery(queryInput, {
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    refetchInterval: 30_000,
  });

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.listReceived.invalidate();
    },
  });

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.listReceived.invalidate();
    },
  });

  const handleMarkAllRead = () => {
    markAllRead.mutate({
      month: selectedMonth === "all" ? undefined : selectedMonth,
    });
  };

  // Flatten items
  const allNotifications: NotificationItem[] = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.items as NotificationItem[]);
  }, [data]);

  const unreadCount = useMemo(() => {
    return allNotifications.filter((n) => !n.readAt).length;
  }, [allNotifications]);

  // Click handler with deep linking
  const handleClick = useCallback(
    async (n: NotificationItem) => {
      if (!n.readAt) {
        await markRead.mutateAsync({ notificationId: n.id });
      }

      if (n.relatedId) {
        if (role === "landlord") {
          if (n.relatedType === "payment") {
            try {
              const info = await utils.client.payments.getRedirectInfo.query({
                paymentId: n.relatedId,
              });
              if (info) {
                router.push(
                  `/landlord/properties/${info.propertyId}/units/${info.unitId}?paymentId=${n.relatedId}`
                );
              }
            } catch {
              /* ignore */
            }
          } else if (n.relatedType === "conversation") {
            try {
              const info = await utils.client.conversations.getRedirectInfo.query({
                conversationId: n.relatedId,
              });
              if (info) {
                router.push(
                  `/landlord/properties/${info.propertyId}/units/${info.unitId}?tab=chat`
                );
              }
            } catch {
              /* ignore */
            }
          } else if (n.relatedType === "lease") {
            try {
              const info = await utils.client.leases.getRedirectInfo.query({
                leaseId: n.relatedId,
              });
              if (info) {
                router.push(
                  `/landlord/properties/${info.propertyId}/units/${info.unitId}`
                );
              }
            } catch {
              /* ignore */
            }
          } else if (n.relatedType === "unit") {
            try {
              const info = await utils.client.units.getRedirectInfo.query({
                unitId: n.relatedId,
              });
              if (info) {
                router.push(
                  `/landlord/properties/${info.propertyId}/units/${info.unitId}`
                );
              }
            } catch {
              /* ignore */
            }
          }
        } else {
          // Tenant role
          if (n.relatedType === "payment") {
            try {
              const info = await utils.client.payments.getRedirectInfo.query({
                paymentId: n.relatedId,
              });
              if (info?.leaseId) {
                router.push(
                  `/tenant/rentals/${info.leaseId}?paymentId=${n.relatedId}`
                );
              } else {
                router.push(`/tenant`);
              }
            } catch {
              router.push(`/tenant`);
            }
          } else if (n.relatedType === "conversation") {
            chatWidget.open();
          } else if (n.relatedType === "lease") {
            if (n.type === "lease_invitation") {
              router.push("/tenant");
            } else {
              router.push(`/tenant/rentals/${n.relatedId}`);
            }
          }
        }
      }
    },
    [markRead, role, router, utils, chatWidget]
  );

  // Group notifications into Today, Yesterday, and Months ("November 2026", etc.)
  // When a specific month is selected:
  // "Choosing a month shows only that month's section."
  // If "all" months is selected:
  // Shows "Today", "Yesterday", then each distinct older month as its own section.
  const groupedSections = useMemo(() => {
    if (allNotifications.length === 0) return [];

    if (selectedMonth !== "all") {
      // Month-filtered: show only that month's section
      const monthObj = (monthsData ?? []).find((m) => m.key === selectedMonth);
      const label =
        monthObj?.label ||
        (() => {
          const [y, m] = selectedMonth.split("-");
          return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
        })();

      return [
        {
          key: selectedMonth,
          label,
          items: allNotifications,
          isTodayOrYesterday: false,
        },
      ];
    }

    // All months: Today, Yesterday, and one section per month
    const todayItems: NotificationItem[] = [];
    const yesterdayItems: NotificationItem[] = [];
    const monthSectionsMap = new Map<string, { label: string; items: NotificationItem[] }>();

    for (const n of allNotifications) {
      const g = getNotificationDateGroup(n.createdAt);
      if (g.key === "today") {
        todayItems.push(n);
      } else if (g.key === "yesterday") {
        yesterdayItems.push(n);
      } else {
        let entry = monthSectionsMap.get(g.key);
        if (!entry) {
          entry = { label: g.label, items: [] };
          monthSectionsMap.set(g.key, entry);
        }
        entry.items.push(n);
      }
    }

    const sections: Array<{
      key: string;
      label: string;
      items: NotificationItem[];
      isTodayOrYesterday: boolean;
    }> = [];

    if (todayItems.length > 0) {
      sections.push({
        key: "today",
        label: "Today",
        items: todayItems,
        isTodayOrYesterday: true,
      });
    }

    if (yesterdayItems.length > 0) {
      sections.push({
        key: "yesterday",
        label: "Yesterday",
        items: yesterdayItems,
        isTodayOrYesterday: true,
      });
    }

    monthSectionsMap.forEach((val, key) => {
      sections.push({
        key,
        label: val.label,
        items: val.items,
        isTodayOrYesterday: false,
      });
    });

    return sections;
  }, [allNotifications, selectedMonth, monthsData]);

  // Infinite scroll trigger with IntersectionObserver
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" }
    );

    const el = loadMoreRef.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Selected month label for the Radix menu trigger
  const selectedMonthLabel = useMemo(() => {
    if (selectedMonth === "all") return "All months";
    const found = (monthsData ?? []).find((m) => m.key === selectedMonth);
    return found ? found.label : selectedMonth;
  }, [selectedMonth, monthsData]);

  // Empty state title & description
  const emptyState = useMemo(() => {
    if (selectedMonth !== "all") {
      const monthObj = (monthsData ?? []).find((m) => m.key === selectedMonth);
      const label = monthObj ? monthObj.label : "this month";
      if (filter === "unread") {
        return {
          title: `No unread notifications in ${label}`,
          description: `You have no unread notifications for ${label}.`,
        };
      }
      return {
        title: `No notifications in ${label}`,
        description: `There are no notifications recorded for ${label}.`,
      };
    }

    if (filter === "unread") {
      return {
        title: "You're all caught up",
        description: "You have no unread notifications.",
      };
    }

    return {
      title: "No notifications yet",
      description: "Payments, lease events, and messages will appear here.",
    };
  }, [selectedMonth, filter, monthsData]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageHeader title="Notifications" />

      <PageContainer width="narrow" className="space-y-6">
        <PageTitleRow
          title="Your notifications"
          description={
            role === "landlord"
              ? "Payments, lease events and messages from your tenants."
              : "Payments, lease events and messages from your landlord."
          }
          actions={
            /* Desktop controls (>= 640px) */
            <div className="hidden sm:flex items-center gap-3">
              {/* Segmented Toggle: All / Unread */}
              <div className="flex rounded-lg bg-muted border border-border p-0.5 text-xs">
                {(["all", "unread"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "px-3 py-1.5 rounded-md font-medium capitalize transition-all",
                      filter === f
                        ? "bg-primary text-primary-foreground shadow"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {/* Month filter Radix Dropdown */}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="h-8 px-3 rounded-lg border border-border bg-card text-xs text-foreground/80 hover:text-foreground hover:border-border flex items-center gap-1.5 focus:outline-none transition-colors"
                  >
                    <span>{selectedMonthLabel}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={4}
                    className="z-50 min-w-[150px] rounded-xl border border-border bg-card p-1 shadow-2xl text-xs animate-in fade-in-0 zoom-in-95"
                  >
                    <DropdownMenu.Item
                      onSelect={() => setSelectedMonth("all")}
                      className={cn(
                        "px-3 py-2 rounded-lg cursor-pointer flex items-center justify-between text-foreground/80 hover:text-foreground hover:bg-accent focus:outline-none transition-colors",
                        selectedMonth === "all" && "bg-accent text-foreground font-medium"
                      )}
                    >
                      <span>All months</span>
                      {selectedMonth === "all" && <Check className="w-3.5 h-3.5 ml-2" />}
                    </DropdownMenu.Item>
                    {(monthsData ?? []).map((m) => (
                      <DropdownMenu.Item
                        key={m.key}
                        onSelect={() => setSelectedMonth(m.key)}
                        className={cn(
                          "px-3 py-2 rounded-lg cursor-pointer flex items-center justify-between text-foreground/80 hover:text-foreground hover:bg-accent focus:outline-none transition-colors",
                          selectedMonth === m.key && "bg-accent text-foreground font-medium"
                        )}
                      >
                        <span>{m.label}</span>
                        {selectedMonth === m.key && <Check className="w-3.5 h-3.5 ml-2" />}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>

              {/* Mark all read button */}
              {unreadCount > 0 && (
                <Button
                  onClick={handleMarkAllRead}
                  disabled={markAllRead.isPending}
                  variant="outline"
                  className="border-border text-foreground/80 hover:text-foreground hover:bg-accent h-8 px-3 text-xs flex items-center gap-1.5 font-medium"
                >
                  <Check className="w-3.5 h-3.5" />
                  Mark all read
                </Button>
              )}
            </div>
          }
        />

        {/* Mobile controls (< 640px): one row for filters and icon mark all read */}
        <div className="sm:hidden flex items-center gap-2 w-full">
          {/* Segmented All / Unread */}
          <div className="flex rounded-lg bg-muted border border-border p-0.5 text-xs shrink-0">
            {(["all", "unread"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-2.5 py-1.5 rounded-md font-medium capitalize text-center transition-all",
                  filter === f
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Month select flexible width */}
          <div className="flex-1 min-w-0">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="w-full h-8 px-2.5 rounded-lg border border-border bg-card text-xs text-foreground/80 hover:text-foreground hover:border-border flex items-center justify-between gap-1.5 focus:outline-none transition-colors"
                >
                  <span className="truncate">{selectedMonthLabel}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="start"
                  sideOffset={4}
                  className="z-50 min-w-[160px] rounded-xl border border-border bg-card p-1 shadow-2xl text-xs animate-in fade-in-0 zoom-in-95"
                >
                  <DropdownMenu.Item
                    onSelect={() => setSelectedMonth("all")}
                    className={cn(
                      "px-3 py-2 rounded-lg cursor-pointer flex items-center justify-between text-foreground/80 hover:text-foreground hover:bg-accent focus:outline-none transition-colors",
                      selectedMonth === "all" && "bg-accent text-foreground font-medium"
                    )}
                  >
                    <span>All months</span>
                    {selectedMonth === "all" && <Check className="w-3.5 h-3.5 ml-2" />}
                  </DropdownMenu.Item>
                  {(monthsData ?? []).map((m) => (
                    <DropdownMenu.Item
                      key={m.key}
                      onSelect={() => setSelectedMonth(m.key)}
                      className={cn(
                        "px-3 py-2 rounded-lg cursor-pointer flex items-center justify-between text-foreground/80 hover:text-foreground hover:bg-accent focus:outline-none transition-colors",
                        selectedMonth === m.key && "bg-accent text-foreground font-medium"
                      )}
                    >
                      <span>{m.label}</span>
                      {selectedMonth === m.key && <Check className="w-3.5 h-3.5 ml-2" />}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>

          {/* Mark all read as icon button on right with tooltip */}
          {unreadCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={markAllRead.isPending}
                  className="w-8 h-8 rounded-lg border border-border bg-card text-foreground/80 hover:text-foreground hover:bg-accent flex items-center justify-center shrink-0"
                  aria-label="Mark all read"
                >
                  <Check className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="end">
                Mark all read
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* List Content */}
        {isLoading ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card divide-y divide-border/60 p-1">
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
        ) : allNotifications.length === 0 ? (
          /* Empty States */
          <div className="rounded-xl border border-border bg-card/40 py-16 px-4 text-center">
            <div className="max-w-md mx-auto space-y-2">
              <Inbox className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <h3 className="text-base font-semibold text-foreground">
                {emptyState.title}
              </h3>
              <p className="text-xs text-muted-foreground">
                {emptyState.description}
              </p>
            </div>
          </div>
        ) : (
          /* Grouped Lists (Today, Yesterday, Month sections) */
          <div className="space-y-6">
            {groupedSections.map((section) => (
              <div key={section.key} className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                  {section.label}
                </div>
                <div className="rounded-xl border border-border bg-card/40 divide-y divide-border/60 overflow-hidden">
                  {section.items.map((n) => {
                    const isUnread = !n.readAt;
                    const iconConfig = getNotificationIconConfig(n.type);
                    const sentence = getNotificationSentence(n);
                    const subtitle = getNotificationSubtitle(n);
                    const timeFormatted = formatNotificationTime(
                      n.createdAt,
                      section.isTodayOrYesterday
                    );

                    return (
                      <div
                        key={n.id}
                        onClick={() => handleClick(n)}
                        className="flex items-center gap-3.5 p-4 hover:bg-accent/50 cursor-pointer transition-colors"
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
                              isUnread
                                ? "text-foreground font-medium"
                                : "text-muted-foreground font-normal"
                            )}
                            title={sentence}
                          >
                            {sentence}
                          </p>
                          {subtitle && (
                            <p
                              className="text-xs text-muted-foreground truncate"
                              title={subtitle}
                            >
                              {subtitle}
                            </p>
                          )}
                        </div>

                        {/* Time & Unread Blue Dot */}
                        <div className="flex items-center gap-2 shrink-0 text-xs">
                          <span
                            className={cn(
                              isUnread
                                ? "text-foreground/80 font-medium"
                                : "text-muted-foreground"
                            )}
                          >
                            {timeFormatted}
                          </span>
                          {isUnread && (
                            <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Infinite Scroll loading indicator */}
            <div ref={loadMoreRef} className="py-2 flex justify-center">
              {isFetchingNextPage && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <span>Loading more...</span>
                </div>
              )}
            </div>
          </div>
        )}
      </PageContainer>
    </div>
  );
}
