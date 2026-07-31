'use client';

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  // MessageSquare,
  CreditCard,
  // Megaphone,
  User,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { ChatWidgetProvider } from "@/components/ChatWidgetContext";
import { ToastProvider } from "@/components/ui/toast";
// import { useChatWidget } from "@/components/ChatWidgetContext";
// import { ChatWidget } from "@/components/ChatWidget";

export default function TenantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
    <ChatWidgetProvider>
      <TenantLayoutContent>{children}</TenantLayoutContent>
      {/* ChatWidget is disabled/hidden per visibility request */}
      {/* <ChatWidget /> */}
    </ChatWidgetProvider>
    </ToastProvider>
  );
}

// Separate inner component so it can consume ChatWidgetContext for the sidebar chat button
function TenantLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // const chatWidget = useChatWidget();

  const { data: user } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation();

  // Unread notices badge — same cache-sharing strategy as landlord unreadCount
  // const { data: noticeRecipients } = trpc.notices.listReceived.useQuery(undefined, {
  //   staleTime: 30000,
  // });
  // const unreadNoticesCount = noticeRecipients?.filter((r) => !r.readAt).length ?? 0;

  // Unread chat messages badge for sidebar item — shares cache with bell (no extra request)
  // const { data: notifications } = trpc.notifications.listReceived.useQuery(undefined, {
  //   staleTime: 10000,
  // });
  // const unreadChatCount =
  //   notifications?.filter((n) => n.type === "message_received" && !n.readAt).length ?? 0;

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const regularNavItems = [
    {
      name: "Dashboard",
      href: "/tenant",
      icon: LayoutDashboard,
      active: pathname === "/tenant",
      badge: 0,
    },
    {
      name: "Payments",
      href: "/tenant/payments",
      icon: CreditCard,
      active: pathname.startsWith("/tenant/payments"),
      badge: 0,
    },
    // Notices route is disabled/hidden per visibility request
    // {
    //   name: "Notices",
    //   href: "/tenant/notices",
    //   icon: Megaphone,
    //   active: pathname.startsWith("/tenant/notices"),
    //   badge: unreadNoticesCount,
    // },
    {
      name: "Profile",
      href: "/tenant/profile",
      icon: User,
      active: pathname.startsWith("/tenant/profile"),
      badge: 0,
    },
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-neutral-950 border-r border-neutral-800 text-white">
      {/* Sidebar Header */}
      <div className="h-16 flex items-center px-6 border-b border-neutral-800 bg-neutral-950/80 sticky top-0 z-10 justify-between">
        <div className="flex items-center gap-2.5">
          <Link
            href="/tenant"
            className="text-xl font-bold tracking-tight text-white hover:opacity-90 font-sans"
          >
            PropLink
          </Link>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-900 border border-neutral-800 text-neutral-400 leading-none">
            Tenant
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsSidebarOpen(false)}
          className="md:hidden p-1 text-neutral-400 hover:text-white"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto" aria-label="Tenant portal navigation">
        {/* Regular link-based nav items */}
        {regularNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setIsSidebarOpen(false)}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                item.active
                  ? "bg-white text-neutral-950 font-semibold shadow-lg"
                  : "text-neutral-400 hover:text-white hover:bg-neutral-900"
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1">{item.name}</span>
              {item.badge > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}

        {/* Chat button is disabled/hidden per visibility request */}
        {/*
        <button
          onClick={() => {
            setIsSidebarOpen(false);
            chatWidget.open();
          }}
          className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
            chatWidget.isOpen
              ? "bg-white text-neutral-950 font-semibold shadow-lg"
              : "text-neutral-400 hover:text-white hover:bg-neutral-900"
          }`}
        >
          <MessageSquare className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">Landlord Chat</span>
          {!chatWidget.isOpen && unreadChatCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
              {unreadChatCount}
            </span>
          )}
        </button>
        */}
      </nav>

      {/* Sidebar Footer (User / Logout) */}
      <div className="p-4 border-t border-neutral-800 bg-neutral-900/50 backdrop-blur-md">
        <div className="flex flex-col space-y-3">
          {user && (
            <Link
              href="/tenant/profile"
              onClick={() => setIsSidebarOpen(false)}
              className="flex items-center space-x-3 px-2 py-1.5 hover:bg-neutral-900 rounded-xl transition-all group"
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.fullName}
                  className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-neutral-700 group-hover:border-neutral-500"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-neutral-800 flex items-center justify-center text-white border border-neutral-700 flex-shrink-0 group-hover:border-neutral-500">
                  <User className="w-4 h-4" />
                </div>
              )}
              <div className="overflow-hidden min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate group-hover:text-neutral-200">
                  {user.fullName}
                </p>
                <p className="text-xs text-neutral-500 truncate">{user.email}</p>
              </div>
            </Link>
          )}
          <Button
            onClick={handleLogout}
            variant="outline"
            disabled={logoutMutation.isPending}
            className="w-full justify-start border-neutral-800 font-bold text-neutral-200 hover:text-white hover:bg-neutral-900 hover:border-neutral-700 h-10 px-4 flex items-center space-x-2 text-sm bg-transparent"
          >
            <LogOut className="w-4 h-4" />
            <span>{logoutMutation.isPending ? "Signing out..." : "Sign Out"}</span>
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans relative flex">
      {/* Desktop Left Sidebar (permanent) */}
      <aside className="hidden md:block w-64 fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {/* Mobile Hamburger Toggle Button */}
      <button
        type="button"
        onClick={() => setIsSidebarOpen(true)}
        className="md:hidden fixed top-3.5 left-4 z-40 p-2 text-neutral-400 hover:text-white hover:bg-neutral-900 border border-neutral-800 rounded-lg bg-neutral-950/80 backdrop-blur-sm transition-all focus:outline-none"
        aria-label="Open sidebar"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile Off-canvas Drawer */}
      {isSidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-neutral-950/80 backdrop-blur-sm md:hidden"
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-50 w-64 md:hidden transform transition-transform duration-300 translate-x-0">
            <SidebarContent />
          </div>
        </>
      )}

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen">
        {/* Topbar with notification bell */}
        <div className="h-14 flex items-center justify-end px-6 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-sm sticky top-0 z-20">
          <NotificationBell />
        </div>
        {children}
      </div>
    </div>
  );
}
