'use client';

import { createContext, useContext, useState } from "react";

interface ChatWidgetContextType {
  /** The unitId currently targeted (landlord-set via open(); tenant resolves it internally in the widget) */
  unitId: string | null;
  isOpen: boolean;
  /** Open the widget — pass unitId for landlord flows; tenant widget ignores it (self-resolves) */
  open: (unitId?: string) => void;
  close: () => void;
  toggle: () => void;
}

const ChatWidgetContext = createContext<ChatWidgetContextType>({
  unitId: null,
  isOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
});

export function ChatWidgetProvider({ children }: { children: React.ReactNode }) {
  const [unitId, setUnitId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const open = (uid?: string) => {
    if (uid) setUnitId(uid);
    setIsOpen(true);
  };

  const close = () => setIsOpen(false);

  const toggle = () => setIsOpen((prev) => !prev);

  return (
    <ChatWidgetContext.Provider value={{ unitId, isOpen, open, close, toggle }}>
      {children}
    </ChatWidgetContext.Provider>
  );
}

export const useChatWidget = () => useContext(ChatWidgetContext);
