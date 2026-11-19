'use client';

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useChatWidget } from "@/components/ChatWidgetContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Loader2 } from "lucide-react";

export default function TenantChatPage() {
  const router = useRouter();
  const chatWidget = useChatWidget();

  useEffect(() => {
    // Open the floating chat widget automatically
    chatWidget.open();
    // Redirect to main tenant dashboard
    router.replace("/tenant");
  }, [chatWidget, router]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <PageHeader title="Chat" />
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
        <p className="text-neutral-500 text-sm">Opening Landlord Chat...</p>
      </div>
    </div>
  );
}
