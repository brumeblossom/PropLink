'use client';

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  Building2, 
  Menu, 
  X, 
  LogOut,
  User,
  Megaphone,
  Bell
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { ChatWidgetProvider } from "@/components/ChatWidgetContext";
// import { ChatWidget } from "@/components/ChatWidget";

export default function LandlordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const { data: user } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation();

  // Unread count: piggyback on the NotificationBell's existing 10s subscription.
  // Calling useQuery here with the same key joins the same cache entry — no extra HTTP
  // request — but we intentionally omit refetchInterval so the Bell's 10s interval wins.
  const { data: notifications } = trpc.notifications.listReceived.useQuery(undefined, {
    staleTime: 10000, // treat data as fresh for 10s to avoid redundant background fetches
  });
  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0;

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const navItems = [
    {
      name: "Dashboard",
      href: "/landlord",
      icon: LayoutDashboard,
      active: pathname === "/landlord",
      badge: 0,
    },
    {
      name: "Properties",
      href: "/landlord/properties",
      icon: Building2,
      active: pathname.startsWith("/landlord/properties"),
      badge: 0,
    },
    {
      name: "Send Announcements",
      href: "/landlord/notices",
      icon: Megaphone,
      active: pathname.startsWith("/landlord/notices"),
      badge: 0,
    },
    {
      name: "Notifications",
      href: "/landlord/notifications",
      icon: Bell,
      active: pathname.startsWith("/landlord/notifications"),
      badge: unreadCount,
    },
    {
      name: "Profile",
      href: "/landlord/profile",
      icon: User,
      active: pathname === "/landlord/profile",
      badge: 0,
    },
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-neutral-950 border-r border-neutral-800 text-white">
      {/* Sidebar Header */}
      <div className="h-16 flex items-center px-6 border-b border-neutral-800 bg-neutral-950/80 sticky top-0 z-10 justify-between">
        <Link href="/landlord" className="text-xl font-bold tracking-tight text-white hover:opacity-90 font-sans">
          PropLink
        </Link>
        <button
          type="button"
          onClick={() => setIsSidebarOpen(false)}
          className="md:hidden p-1 text-neutral-400 hover:text-white"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
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
      </nav>

      {/* Sidebar Footer (Profile / Logout) */}
      <div className="p-4 border-t border-neutral-800 bg-neutral-900/50 backdrop-blur-md">
        <div className="flex flex-col space-y-3">
          {user && (
            <Link 
              href="/landlord/profile"
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
                <p className="text-sm font-semibold text-white truncate group-hover:text-neutral-200">{user.fullName}</p>
                <p className="text-xs text-neutral-500 truncate">{user.email}</p>
              </div>
            </Link>
          )}
          <Button
            onClick={handleLogout}
            variant="outline"
            disabled={logoutMutation.isPending}
            className="w-full justify-start border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-900 hover:border-neutral-700 h-10 px-4 flex items-center space-x-2 text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>{logoutMutation.isPending ? "Signing out..." : "Sign Out"}</span>
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <ChatWidgetProvider>
      <div className="min-h-screen bg-neutral-950 text-white relative flex">
      {/* Desktop Left Sidebar (permanent) */}
      <aside className="hidden md:block w-64 fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {/* Mobile Hamburger Toggle Button */}
      <button
        type="button"
        onClick={() => setIsSidebarOpen(true)}
        className="md:hidden fixed top-3.5 left-4 z-40 p-2 text-neutral-400 hover:text-white hover:bg-neutral-900 border border-neutral-800 rounded-lg bg-neutral-950/80 backdrop-blur-sm transition-all focus:outline-none"
        aria-label="Open Sidebar"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile Off-canvas Drawer Sidebar */}
      {isSidebarOpen && (
        <>
          {/* Backdrop overlay */}
          <div
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-neutral-950/80 backdrop-blur-sm md:hidden"
          />
          
          {/* Sidebar drawer container */}
          <div className="fixed inset-y-0 left-0 z-50 w-64 md:hidden transform transition-transform duration-300 translate-x-0">
            <SidebarContent />
          </div>
        </>
      )}

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen">
        {/* Topbar with bell */}
        <div className="h-14 flex items-center justify-end px-6 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-sm sticky top-0 z-20">
          <NotificationBell />
        </div>
        {children}
      </div>
    </div>
    {/* ChatWidget is disabled/hidden per visibility request */}
    {/* <ChatWidget /> */}
    </ChatWidgetProvider>
  );
}
