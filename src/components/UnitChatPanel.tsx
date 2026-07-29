'use client';

import { useState, useRef, useEffect } from "react";
import { trpc } from "@/utils/trpc";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Send, User, MessageSquare, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface UnitChatPanelProps {
  unitId: string;
  /** Override container classes — used by ChatWidget to control height and strip the border */
  className?: string;
}

export function UnitChatPanel({ unitId, className }: UnitChatPanelProps) {
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useContext();

  // Queries
  const { data: conversation, isLoading, refetch } = trpc.conversations.getForUnit.useQuery(
    { unitId },
    { enabled: !!unitId }
  );

  const { data: currentUser } = trpc.auth.me.useQuery();

  // Mutations
  const sendMessageMutation = trpc.conversations.sendMessage.useMutation({
    onSuccess: () => {
      setMessageText("");
      setSending(false);
      refetch();
    },
    onError: (err) => {
      alert(err.message);
      setSending(false);
    },
  });

  const markReadMutation = trpc.conversations.markRead.useMutation({
    onSuccess: () => {
      // Invalidate notifications unread queries to clear bell badge immediately
      utils.notifications.listReceived.invalidate();
      utils.notices.listReceived.invalidate();
    },
  });

  // Scroll to bottom on load/update
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (conversation?.messages) {
      scrollToBottom();
    }
  }, [conversation?.messages]);

  // Realtime subscription setup
  useEffect(() => {
    if (!conversation?.id) return;

    // Mark as read immediately when joining
    markReadMutation.mutate({ conversationId: conversation.id });

    const supabase = createClient();
    const channel = supabase
      .channel(`chat:${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        async () => {
          // Refetch tRPC query to populate sender info correctly
          await refetch();
          // Mark conversation as read
          markReadMutation.mutate({ conversationId: conversation.id });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation?.id]);

  // Scroll entire container into view if tab=chat query parameter exists (e.g. landlord deep link)
  useEffect(() => {
    if (typeof window !== "undefined" && conversation?.id) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "chat") {
        setTimeout(() => {
          containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 150);
      }
    }
  }, [conversation?.id]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !conversation?.id || sending) return;

    setSending(true);
    try {
      await sendMessageMutation.mutateAsync({
        conversationId: conversation.id,
        body: messageText.trim(),
      });
    } catch {
      // Handled in mutation error handler
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-12 text-center text-neutral-500">
        <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
        <p className="text-xs">Loading chat conversation...</p>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-12 text-center text-neutral-500">
        <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-40 text-neutral-400" />
        <p className="text-base font-semibold text-neutral-300">No active chat</p>
        <p className="text-xs text-neutral-500 mt-1">
          Chat is only available during active leases.
        </p>
      </div>
    );
  }

  const counterparty = currentUser?.role === "landlord" ? conversation.tenant : conversation.landlord;

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col overflow-hidden",
        className ?? "rounded-xl border border-neutral-800 bg-neutral-900/15 h-[500px] shadow-lg"
      )}
    >
      {/* Header bar */}
      <div className="px-5 py-4 border-b border-neutral-850 bg-neutral-950/45 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {counterparty.avatarUrl ? (
            <img 
              src={counterparty.avatarUrl} 
              alt={counterparty.fullName} 
              className="w-9 h-9 rounded-full object-cover border border-neutral-800"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-850">
              <User className="w-4 h-4 text-neutral-400" />
            </div>
          )}
          <div>
            <h4 className="text-sm font-semibold text-white leading-tight">{counterparty.fullName}</h4>
            <span className="text-[10px] text-neutral-500 capitalize">{currentUser?.role === "landlord" ? "Tenant" : "Landlord"}</span>
          </div>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent">
        {conversation.messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-neutral-500 py-12">
            <MessageSquare className="w-10 h-10 mb-2 opacity-30 text-neutral-400" />
            <p className="text-xs font-medium text-neutral-400">No messages yet</p>
            <p className="text-[11px] text-neutral-600 mt-0.5">Send a message to start the conversation.</p>
          </div>
        ) : (
          conversation.messages.map((msg) => {
            const isMe = msg.senderId === currentUser?.id;
            const formattedTime = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            return (
              <div 
                key={msg.id}
                className={cn("flex items-end space-x-2.5", isMe ? "justify-end" : "justify-start")}
              >
                {!isMe && (
                  <div className="flex-shrink-0 mb-1">
                    {msg.sender.avatarUrl ? (
                      <img 
                        src={msg.sender.avatarUrl} 
                        alt="" 
                        className="w-7 h-7 rounded-full object-cover border border-neutral-800"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-850">
                        <User className="w-3.5 h-3.5 text-neutral-400" />
                      </div>
                    )}
                  </div>
                )}
                
                <div className="flex flex-col space-y-1 max-w-[70%]">
                  <div 
                    className={cn(
                      "px-4 py-2.5 text-xs rounded-2xl whitespace-pre-wrap leading-relaxed shadow",
                      isMe 
                        ? "bg-white text-neutral-950 rounded-br-none" 
                        : "bg-neutral-900/90 border border-neutral-850 text-neutral-100 rounded-bl-none"
                    )}
                  >
                    {msg.body}
                  </div>
                  <span className={cn("text-[9px] text-neutral-500 font-medium font-sans px-1.5", isMe ? "text-right" : "text-left")}>
                    {formattedTime}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input panel */}
      <form onSubmit={handleSend} className="p-3 border-t border-neutral-850 bg-neutral-950/25 flex items-center space-x-2">
        <input
          type="text"
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          placeholder={`Type a message to ${counterparty.fullName}...`}
          disabled={sending}
          className="flex-1 rounded-xl border border-neutral-850 bg-neutral-900/50 px-4 py-2.5 text-xs text-white placeholder-neutral-500 focus:border-neutral-700 focus:outline-none text-sm"
        />
        <Button
          type="submit"
          disabled={!messageText.trim() || sending}
          className="h-10 w-10 p-0 rounded-xl bg-white text-neutral-950 hover:bg-neutral-200 transition-colors flex items-center justify-center flex-shrink-0"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin text-neutral-950" /> : <Send className="w-4 h-4 text-neutral-950" />}
        </Button>
      </form>
    </div>
  );
}
