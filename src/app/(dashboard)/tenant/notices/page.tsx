'use client';

import { useState } from "react";
import { trpc } from "@/utils/trpc";
import { Megaphone, ChevronDown, ChevronUp, Inbox, User } from "lucide-react";

const noticeTypeLabel: Record<string, string> = {
  rent_reminder: "Rent Reminder",
  maintenance: "Maintenance",
  general: "General",
  rent_increment: "Rent Increase",
};

const noticeTypeBadgeClass: Record<string, string> = {
  rent_reminder: "bg-yellow-950/30 text-yellow-400 border-yellow-900/30",
  maintenance: "bg-blue-950/30 text-blue-400 border-blue-900/30",
  general: "bg-neutral-900 text-neutral-400 border-neutral-800",
  rent_increment: "bg-red-950/30 text-red-400 border-red-900/30",
};

export default function TenantNoticesPage() {
  const utils = trpc.useUtils();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: notices, isLoading } = trpc.notices.listReceived.useQuery();

  const markRead = trpc.notices.markRead.useMutation({
    onSuccess: () => {
      utils.notices.listReceived.invalidate();
    },
  });

  const handleToggle = (recipientId: string, isUnread: boolean) => {
    if (expandedId === recipientId) {
      setExpandedId(null);
    } else {
      setExpandedId(recipientId);
      if (isUnread) {
        markRead.mutate({ recipientId });
      }
    }
  };

  const unreadCount = notices?.filter((r) => !r.readAt).length ?? 0;

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notices</h1>
          <p className="text-neutral-400 text-sm mt-1">
            Official notices and announcements from your landlord.
          </p>
        </div>
        {unreadCount > 0 && (
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-2 text-xs font-bold text-white flex-shrink-0 mt-1">
            {unreadCount} unread
          </span>
        )}
      </div>

      {/* Notices List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-xl border border-neutral-800 bg-neutral-900/20 animate-pulse"
            />
          ))}
        </div>
      ) : !notices || notices.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center mx-auto">
            <Inbox className="w-8 h-8 text-neutral-600" />
          </div>
          <div>
            <p className="text-lg font-semibold text-white">No notices yet</p>
            <p className="text-neutral-500 text-sm mt-1">
              Your landlord hasn&apos;t sent any notices to your account.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map((recipient) => {
            const notice = recipient.notice;
            const isUnread = !recipient.readAt;
            const isExpanded = expandedId === recipient.id;
            const typeLabel = noticeTypeLabel[notice.type] ?? notice.type.replace("_", " ");
            const badgeClass =
              noticeTypeBadgeClass[notice.type] ?? "bg-neutral-900 text-neutral-400 border-neutral-800";

            return (
              <div
                key={recipient.id}
                className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                  isUnread
                    ? "border-neutral-700 bg-neutral-900/40"
                    : "border-neutral-800 bg-neutral-900/10"
                }`}
              >
                {/* Notice Row */}
                <button
                  type="button"
                  onClick={() => handleToggle(recipient.id, isUnread)}
                  className="w-full flex items-start gap-4 p-5 text-left hover:bg-neutral-900/20 transition-colors"
                >
                  {/* Unread dot */}
                  <div className="flex-shrink-0 mt-1.5">
                    <div
                      className={`w-2 h-2 rounded-full transition-colors ${
                        isUnread ? "bg-white" : "bg-neutral-700"
                      }`}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badgeClass}`}>
                        {typeLabel}
                      </span>
                      {isUnread && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white text-neutral-950">
                          New
                        </span>
                      )}
                    </div>
                    <p className={`font-semibold text-sm truncate ${isUnread ? "text-white" : "text-neutral-300"}`}>
                      {notice.title}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <div className="flex items-center gap-1.5">
                        {notice.landlord.avatarUrl ? (
                          <img
                            src={notice.landlord.avatarUrl}
                            alt={notice.landlord.fullName}
                            className="w-4 h-4 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-neutral-800 flex items-center justify-center">
                            <User className="w-2.5 h-2.5 text-neutral-500" />
                          </div>
                        )}
                        <span>{notice.landlord.fullName}</span>
                      </div>
                      <span>·</span>
                      <span>
                        {new Date(notice.createdAt).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Chevron */}
                  <div className="flex-shrink-0 text-neutral-500 mt-0.5">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </button>

                {/* Expanded Body */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-neutral-800/60">
                    <div className="pt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Megaphone className="w-4 h-4 text-neutral-500 flex-shrink-0" />
                        <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                          Notice Body
                        </span>
                      </div>
                      <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">
                        {notice.body}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
