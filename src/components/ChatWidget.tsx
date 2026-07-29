'use client';

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { trpc } from "@/utils/trpc";
import { UnitChatPanel } from "@/components/UnitChatPanel";
import { useChatWidget } from "@/components/ChatWidgetContext";
import { MessageSquare, X } from "lucide-react";

/**
 * Floating chat bubble (FAB) that expands into a compact chat panel.
 * - Tenant: auto-resolves unitId from their active lease — no configuration needed.
 * - Landlord: unitId is set externally via ChatWidgetContext.open(unitId),
 *   either from a "Chat" button on the unit detail page or from a notification click.
 */
export function ChatWidget() {
  const { unitId: contextUnitId, isOpen, close, toggle } = useChatWidget();
  const panelRef = useRef<HTMLDivElement>(null);

  // Resolve current user role
  const { data: currentUser } = trpc.auth.me.useQuery();

  // Tenant auto-resolution: if the user is a tenant, grab their active lease's unitId
  const { data: leases } = trpc.leases.getMine.useQuery(undefined, {
    enabled: currentUser?.role === "tenant",
  });
  const tenantActiveLease = leases?.find((l) => !l.terminatedAt);

  // The unit this widget will chat on:
  // - tenant: always their active lease unit
  // - landlord: whatever was passed to open(unitId)
  const resolvedUnitId =
    currentUser?.role === "tenant" ? tenantActiveLease?.unitId ?? null : contextUnitId;

  // Unread message count — piggybacks on the same cache key as the notification bell,
  // so no extra request is made (shared TanStack Query cache entry).
  const { data: notifications } = trpc.notifications.listReceived.useQuery(undefined, {
    staleTime: 10000,
    enabled: !!currentUser,
  });
  const unreadChatCount =
    notifications?.filter((n) => n.type === "message_received" && !n.readAt).length ?? 0;

  // Close on Escape key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, close]);

  // Don't render anything at all until we know the user's role
  if (!currentUser) return null;

  // Hide widget for tenants with no active lease
  if (currentUser.role === "tenant" && !tenantActiveLease) return null;

  const handleFabClick = () => {
    if (currentUser.role === "tenant") {
      // Tenant: just toggle — widget knows the unitId
      toggle();
    } else {
      // Landlord: if no unit targeted yet, open but show placeholder
      toggle();
    }
  };

  const panelTitle =
    currentUser.role === "tenant" ? "Landlord Chat" : "Tenant Chat";

  const widget = (
    <div
      className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3 select-none"
      style={{ pointerEvents: "none" }} // prevents invisible div blocking clicks
    >
      {/* Expanded Chat Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="w-[370px] rounded-2xl border border-neutral-800 bg-neutral-950 shadow-[0_8px_40px_rgba(0,0,0,0.7)] overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200"
          style={{ pointerEvents: "auto" }}
        >
          {/* Panel Header */}
          <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-900/60 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 rounded-lg bg-neutral-800">
                <MessageSquare className="w-3.5 h-3.5 text-neutral-300" />
              </div>
              <span className="text-sm font-semibold text-white">{panelTitle}</span>
            </div>
            <button
              onClick={close}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors focus:outline-none"
              aria-label="Close chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Chat Content */}
          <div className="flex-1 min-h-0" style={{ height: "420px" }}>
            {resolvedUnitId ? (
              <UnitChatPanel
                unitId={resolvedUnitId}
                className="h-full bg-neutral-950/20"
              />
            ) : (
              /* Landlord: no unit selected yet */
              <div className="h-full flex flex-col items-center justify-center text-center px-6 space-y-3 py-8">
                <div className="w-14 h-14 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                  <MessageSquare className="w-7 h-7 text-neutral-600" />
                </div>
                <p className="text-sm font-semibold text-neutral-300">No conversation selected</p>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  Click <strong className="text-neutral-400">&quot;Chat with Tenant&quot;</strong> on a unit
                  page, or tap a chat notification to open a conversation here.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Action Button */}
      <button
        id="chat-widget-fab"
        onClick={handleFabClick}
        className={`
          relative w-14 h-14 rounded-full shadow-2xl flex items-center justify-center
          transition-all duration-200 hover:scale-105 active:scale-95 focus:outline-none
          ${isOpen
            ? "bg-neutral-800 text-white hover:bg-neutral-700"
            : "bg-white text-neutral-950 hover:bg-neutral-100"
          }
        `}
        style={{ pointerEvents: "auto" }}
        aria-label={isOpen ? "Close chat" : "Open chat"}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <X className="w-5 h-5" />
        ) : (
          <MessageSquare className="w-5 h-5" />
        )}

        {/* Unread badge */}
        {!isOpen && unreadChatCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-neutral-950 px-1 animate-in zoom-in-50 duration-150"
            aria-label={`${unreadChatCount} unread message${unreadChatCount !== 1 ? "s" : ""}`}
          >
            {unreadChatCount}
          </span>
        )}
      </button>
    </div>
  );

  // Render via portal so z-index is never clipped by parent stacking contexts
  if (typeof document === "undefined") return null;
  return createPortal(widget, document.body);
}
