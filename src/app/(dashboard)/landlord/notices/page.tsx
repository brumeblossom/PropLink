'use client';

import { useState } from "react";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { NoticeType, NotificationChannel } from "@prisma/client";
import { 
  Megaphone, 
  Plus, 
  Send, 
  Building2, 
  User, 
  Calendar, 
  Mail, 
  Phone, 
  Smartphone,
  ChevronDown,
  ChevronUp,
  Inbox,
  X
} from "lucide-react";

export default function LandlordNoticesPage() {
  const utils = trpc.useUtils();
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [expandedNoticeId, setExpandedNoticeId] = useState<string | null>(null);

  // Form State
  const [targetType, setTargetType] = useState<"all" | "property" | "unit">("all");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<NoticeType>(NoticeType.general);
  const [channels, setChannels] = useState<NotificationChannel[]>([NotificationChannel.in_app]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Queries
  const { data: notices, isLoading: isLoadingNotices } = trpc.notices.listSent.useQuery();
  const { data: properties } = trpc.properties.list.useQuery();

  // Mutations
  const sendNoticeMutation = trpc.notices.send.useMutation({
    onSuccess: () => {
      utils.notices.listSent.invalidate();
      setIsComposeOpen(false);
      resetForm();
    },
    onError: (err) => {
      setError(err.message);
      setLoading(false);
    },
  });

  const resetForm = () => {
    setTargetType("all");
    setSelectedPropertyId("");
    setSelectedUnitId("");
    setTitle("");
    setBody("");
    setType(NoticeType.general);
    setChannels([NotificationChannel.in_app]);
    setError(null);
    setLoading(false);
  };

  const handleChannelChange = (channel: NotificationChannel) => {
    if (channels.includes(channel)) {
      if (channel === NotificationChannel.in_app) return; // In-app is mandatory
      setChannels(channels.filter((c) => c !== channel));
    } else {
      setChannels([...channels, channel]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !body.trim()) {
      setError("Title and body are required.");
      return;
    }

    if (targetType !== "all" && !selectedPropertyId) {
      setError("Please select a property.");
      return;
    }

    if (targetType === "unit" && !selectedUnitId) {
      setError("Please select a unit.");
      return;
    }

    setLoading(true);
    try {
      await sendNoticeMutation.mutateAsync({
        targetType,
        targetId: targetType === "unit" ? selectedUnitId : (targetType === "property" ? selectedPropertyId : undefined),
        title: title.trim(),
        body: body.trim(),
        type,
        channels,
      });
    } catch {
      // Handled by onError
    }
  };

  // Find units for selected property
  const selectedProperty = properties?.find((p) => p.id === selectedPropertyId);
  const units = selectedProperty?.units || [];

  const noticeTypeLabels: Record<NoticeType, string> = {
    general: "General",
    maintenance: "Maintenance",
    rent_reminder: "Rent Reminder",
    rent_increment: "Rent Increment",
  };

  const noticeTypeStyles: Record<NoticeType, string> = {
    general: "bg-blue-950/40 border-blue-900 text-blue-400",
    maintenance: "bg-amber-950/40 border-amber-900 text-amber-400",
    rent_reminder: "bg-purple-950/40 border-purple-900 text-purple-400",
    rent_increment: "bg-rose-950/40 border-rose-900 text-rose-400",
  };

  return (
    <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Send Announcements</h1>
          <p className="text-neutral-400 mt-1 text-sm">
            Send updates, maintenance announcements, and payment reminders to your tenants.
          </p>
        </div>
        <Button
          onClick={() => setIsComposeOpen(true)}
          className="bg-white text-neutral-950 hover:bg-neutral-200 transition-all font-semibold flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Compose Notice</span>
        </Button>
      </div>

      {/* Notices List */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-neutral-200">Sent History</h2>

        {isLoadingNotices ? (
          <div className="py-20 text-center text-neutral-500 animate-pulse">
            Loading sent notices...
          </div>
        ) : !notices || notices.length === 0 ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/10 p-12 text-center text-neutral-500 max-w-2xl mx-auto">
            <Inbox className="w-12 h-12 mx-auto mb-4 opacity-40 text-neutral-400" />
            <p className="text-base font-semibold text-neutral-300">No notices sent yet</p>
            <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
              Announcements or rent reminders you compose will show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notices.map((notice) => {
              const isExpanded = expandedNoticeId === notice.id;
              const formattedDate = new Date(notice.createdAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });

              let targetLabel = "All Properties";
              if (notice.unit) {
                targetLabel = `Unit ${notice.unit.unitNumber} (${notice.property?.name})`;
              } else if (notice.property) {
                targetLabel = notice.property.name;
              }

              return (
                <div 
                  key={notice.id}
                  className="rounded-xl border border-neutral-800 bg-neutral-900/20 hover:border-neutral-700/80 transition-all overflow-hidden"
                >
                  {/* Notice Summary Header */}
                  <div 
                    onClick={() => setExpandedNoticeId(isExpanded ? null : notice.id)}
                    className="p-5 flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-start space-x-4 min-w-0">
                      <div className="mt-1 p-2 rounded-lg bg-neutral-900 border border-neutral-800">
                        <Megaphone className="w-5 h-5 text-neutral-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-semibold text-white truncate text-base">{notice.title}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${noticeTypeStyles[notice.type]}`}>
                            {noticeTypeLabels[notice.type]}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-neutral-500">
                          <span className="flex items-center space-x-1">
                            <Building2 className="w-3.5 h-3.5" />
                            <span>{targetLabel}</span>
                          </span>
                          <span className="flex items-center space-x-1 font-sans">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{formattedDate}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <User className="w-3.5 h-3.5" />
                            <span>Sent to {notice.recipients.length} tenants</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4">
                      {/* Channels Indicator */}
                      <div className="hidden sm:flex items-center space-x-2 text-neutral-500">
                        <Smartphone className={`w-4 h-4 ${notice.channels.includes(NotificationChannel.in_app) ? "text-emerald-400" : ""}`} />
                        <Mail className={`w-4 h-4 ${notice.channels.includes(NotificationChannel.email) ? "text-sky-400" : ""}`} />
                        <Phone className={`w-4 h-4 ${notice.channels.includes(NotificationChannel.whatsapp) ? "text-indigo-400" : ""}`} />
                      </div>
                      {isExpanded ? <ChevronUp className="w-5 h-5 text-neutral-400" /> : <ChevronDown className="w-5 h-5 text-neutral-400" />}
                    </div>
                  </div>

                  {/* Expanded Body Panel */}
                  {isExpanded && (
                    <div className="px-5 pb-5 pt-1 border-t border-neutral-900 bg-neutral-950/20 space-y-4">
                      <div className="whitespace-pre-wrap text-sm text-neutral-300 leading-relaxed font-sans bg-neutral-950/40 rounded-xl p-4 border border-neutral-900">
                        {notice.body}
                      </div>

                      {/* Recipients status */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Recipients Log</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {notice.recipients.map((recipient) => (
                            <div key={recipient.id} className="p-3 rounded-lg border border-neutral-900 bg-neutral-950/40 text-xs flex flex-col space-y-1.5">
                              <span className="font-semibold text-white truncate">{recipient.tenant.fullName}</span>
                              <span className="text-neutral-500 truncate">{recipient.tenant.email}</span>
                              <div className="flex items-center space-x-2.5 pt-1 mt-1 border-t border-neutral-900 text-[10px] text-neutral-400">
                                <span className="flex items-center space-x-1">
                                  <Smartphone className="w-3 h-3 text-emerald-400" />
                                  <span>{recipient.readAt ? "Read" : "Delivered"}</span>
                                </span>
                                {notice.channels.includes(NotificationChannel.email) && (
                                  <span className="flex items-center space-x-1 text-neutral-500">
                                    <Mail className="w-3 h-3" />
                                    <span>Pending</span>
                                  </span>
                                )}
                                {notice.channels.includes(NotificationChannel.whatsapp) && (
                                  <span className="flex items-center space-x-1 text-neutral-500">
                                    <Phone className="w-3 h-3" />
                                    <span>Pending</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Compose Modal */}
      {isComposeOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsComposeOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-900 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2 bg-neutral-900 rounded-xl border border-neutral-850">
                <Send className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Compose Announcement</h3>
                <p className="text-xs text-neutral-400">Select target audience and delivery channels.</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              {/* Target Type Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">Audience Scope</label>
                <div className="flex rounded-lg bg-neutral-900/80 p-1 border border-neutral-800/80 text-xs">
                  <button
                    type="button"
                    onClick={() => { setTargetType("all"); setSelectedPropertyId(""); setSelectedUnitId(""); }}
                    className={`w-1/3 rounded-md py-1.5 font-semibold transition-all ${
                      targetType === "all" ? "bg-white text-neutral-950 shadow" : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    All Properties
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTargetType("property"); setSelectedUnitId(""); }}
                    className={`w-1/3 rounded-md py-1.5 font-semibold transition-all ${
                      targetType === "property" ? "bg-white text-neutral-950 shadow" : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    Property
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetType("unit")}
                    className={`w-1/3 rounded-md py-1.5 font-semibold transition-all ${
                      targetType === "unit" ? "bg-white text-neutral-950 shadow" : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    Single Unit
                  </button>
                </div>
              </div>

              {/* Target Dropdowns */}
              {targetType !== "all" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-300">Select Property</label>
                    <select
                      value={selectedPropertyId}
                      onChange={(e) => { setSelectedPropertyId(e.target.value); setSelectedUnitId(""); }}
                      className="block w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-white text-xs focus:border-neutral-700 focus:outline-none"
                    >
                      <option value="">-- Choose Property --</option>
                      {properties?.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  {targetType === "unit" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-neutral-300">Select Unit</label>
                      <select
                        value={selectedUnitId}
                        onChange={(e) => setSelectedUnitId(e.target.value)}
                        disabled={!selectedPropertyId}
                        className="block w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-white text-xs focus:border-neutral-700 focus:outline-none disabled:opacity-55"
                      >
                        <option value="">-- Choose Unit --</option>
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>Unit {u.unitNumber}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Title & Type */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300">Subject/Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Scheduled Water Maintenance"
                    className="block w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-white text-xs focus:border-neutral-700 focus:outline-none placeholder-neutral-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300">Category</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as NoticeType)}
                    className="block w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-white text-xs focus:border-neutral-700 focus:outline-none"
                  >
                    <option value={NoticeType.general}>General</option>
                    <option value={NoticeType.maintenance}>Maintenance</option>
                    <option value={NoticeType.rent_reminder}>Rent Reminder</option>
                    <option value={NoticeType.rent_increment}>Rent Increment</option>
                  </select>
                </div>
              </div>

              {/* Body */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">Message Content</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write details of the announcement here..."
                  rows={5}
                  className="block w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-white text-xs focus:border-neutral-700 focus:outline-none placeholder-neutral-600 font-sans"
                />
              </div>

              {/* Channels Selector */}
              <div className="space-y-2 border-t border-neutral-900 pt-3">
                <label className="text-xs font-semibold text-neutral-300">Delivery Channels</label>
                <div className="flex flex-wrap gap-4 text-xs">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channels.includes(NotificationChannel.in_app)}
                      onChange={() => handleChannelChange(NotificationChannel.in_app)}
                      className="rounded border-neutral-800 bg-neutral-900 text-white focus:ring-0 w-4 h-4 cursor-not-allowed"
                      disabled
                    />
                    <span className="text-neutral-300 font-medium">In-App (Required)</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channels.includes(NotificationChannel.email)}
                      onChange={() => handleChannelChange(NotificationChannel.email)}
                      className="rounded border-neutral-800 bg-neutral-900 text-white focus:ring-0 w-4 h-4"
                    />
                    <span className="text-neutral-400 hover:text-neutral-300">Email</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channels.includes(NotificationChannel.whatsapp)}
                      onChange={() => handleChannelChange(NotificationChannel.whatsapp)}
                      className="rounded border-neutral-800 bg-neutral-900 text-white focus:ring-0 w-4 h-4"
                    />
                    <span className="text-neutral-400 hover:text-neutral-300">WhatsApp</span>
                  </label>
                </div>
                <p className="text-[10px] text-neutral-500">
                  Email &amp; WhatsApp delivery status will remain &apos;pending&apos; until real dispatch is enabled.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-neutral-900">
                <Button
                  type="button"
                  onClick={() => setIsComposeOpen(false)}
                  variant="outline"
                  className="border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-900 text-xs h-9 px-4 transition-all"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-white text-neutral-950 hover:bg-neutral-200 transition-all font-semibold flex items-center space-x-2 text-xs h-9 px-4"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{loading ? "Sending..." : "Send Announcement"}</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
