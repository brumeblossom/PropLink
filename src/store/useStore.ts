import { create } from "zustand";

interface AppState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  userRole: "landlord" | "tenant" | null;
  setUserRole: (role: "landlord" | "tenant" | null) => void;
}

export const useStore = create<AppState>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  userRole: null,
  setUserRole: (role) => set({ userRole: role }),
}));
