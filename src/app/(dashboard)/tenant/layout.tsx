'use client';

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import {
  Home,
  Bell,
  Settings,
  X,
  LogOut,
} from "lucide-react";
import { ChatWidgetProvider } from "@/components/ChatWidgetContext";
import { ToastProvider } from "@/components/ui/toast";
import { SidebarProvider, useSidebar } from "@/components/layout/SidebarContext";

export default function TenantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <ChatWidgetProvider>
        <SidebarProvider>
          <TenantLayoutContent>{children}</TenantLayoutContent>
        </SidebarProvider>
      </ChatWidgetProvider>
    </ToastProvider>
  );
}

function TenantLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isOpen: isSidebarOpen, close: closeSidebar } = useSidebar();

  const { data: user } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation();

  const { data: notifications } = trpc.notifications.listReceived.useQuery(undefined, {
    staleTime: 30_000,
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
      name: "Home",
      href: "/tenant",
      icon: Home,
      active: pathname === "/tenant" || pathname.startsWith("/tenant/rentals"),
      badge: 0,
    },
    {
      name: "Notifications",
      href: "/tenant/notifications",
      icon: Bell,
      active: pathname.startsWith("/tenant/notifications"),
      badge: unreadCount,
    },
    {
      name: "Settings",
      href: "/tenant/settings",
      icon: Settings,
      active: pathname.startsWith("/tenant/settings") || pathname.startsWith("/tenant/profile"),
      badge: 0,
    },
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-neutral-950 border-r border-neutral-800 text-white">
      {/* Sidebar Header - exact h-16 to line up with PageHeader */}
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
          onClick={closeSidebar}
          className="md:hidden p-1 text-neutral-400 hover:text-white"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto" aria-label="Tenant portal navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={closeSidebar}
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

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-neutral-800 bg-neutral-900/50 backdrop-blur-md">
        <div className="flex flex-col space-y-3">
          {user && (
            <Link
              href="/tenant/settings"
              onClick={closeSidebar}
              className="flex items-center px-3 py-2 hover:bg-neutral-900 rounded-lg transition-all group"
            >
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

      {/* Mobile Off-canvas Drawer */}
      {isSidebarOpen && (
        <>
          <div
            onClick={closeSidebar}
            className="fixed inset-0 z-40 bg-neutral-950/80 backdrop-blur-sm md:hidden"
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 z-50 w-64 md:hidden transform transition-transform duration-300 translate-x-0">
            <SidebarContent />
          </div>
        </>
      )}

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen">
        {children}
      </div>
    </div>
  );
}
