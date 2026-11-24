'use client';

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTitleRow } from "@/components/layout/PageTitleRow";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { NoticeType } from "@prisma/client";
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalField, ModalSegmentedControl } from "@/components/ui/modal";
import { 
  Plus, 
  Search, 
  X,
  ChevronLeft,
  ChevronRight,
  Inbox
} from "lucide-react";
import { formatDateGB } from "@/lib/billing";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

const noticeTypeLabels: Record<NoticeType, string> = {
  general: "General",
  maintenance: "Maintenance",
  rent_reminder: "Rent Reminder",
  rent_increment: "Rent Increment",
};

const noticeTypeStyles: Record<NoticeType, string> = {
  general: "bg-primary-tint text-primary border border-primary/20",
  maintenance: "bg-warning-tint text-warning border border-warning/20",
  rent_reminder: "bg-kpi-gold-tint text-kpi-gold border border-kpi-gold/20",
  rent_increment: "bg-destructive-tint text-destructive border border-destructive/20",
};

interface NoticeRecipientItem {
  id: string;
  readAt: string | Date | null;
  tenant: {
    id: string;
    fullName: string;
    email: string;
  } | null;
}

interface NoticeRowItem {
  id: string;
  title: string;
  body: string;
  type: string;
  createdAt: string | Date;
  property: { id: string; name: string } | null;
  unit: { id: string; unitNumber: string; property: { id: string; name: string } | null } | null;
  recipients: NoticeRecipientItem[];
}

function NoticesContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const utils = trpc.useUtils();
  const { toast } = useToast();

  // URL state
  const initialSearch = searchParams.get("search") || "";
  const initialProperty = searchParams.get("property") || "";
  const initialCategory = (searchParams.get("category") as NoticeType) || "";
  const initialPage = parseInt(searchParams.get("page") || "1", 10);

  const [searchInput, setSearchInput] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [propertyId, setPropertyId] = useState(initialProperty);
  const [category, setCategory] = useState<NoticeType | "">(initialCategory);
  const [page, setPage] = useState(initialPage);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [viewingMessageNotice, setViewingMessageNotice] = useState<NoticeRowItem | null>(null);
  const [viewingRecipientsNotice, setViewingRecipientsNotice] = useState<NoticeRowItem | null>(null);

  // Form State
  const [targetType, setTargetType] = useState<"all" | "property" | "unit">("all");
  const [formPropertyId, setFormPropertyId] = useState("");
  const [formUnitId, setFormUnitId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<NoticeType>(NoticeType.general);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Sync state to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (propertyId) params.set("property", propertyId);
    if (category) params.set("category", category);
    if (page > 1) params.set("page", page.toString());
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }, [debouncedSearch, propertyId, category, page, pathname, router]);

  // Queries
  const { data: properties } = trpc.properties.list.useQuery();
  const { data: sentData, isLoading: isLoadingNotices } = trpc.notices.listSent.useQuery({
    search: debouncedSearch || undefined,
    propertyId: propertyId || undefined,
    category: category || undefined,
    page,
    pageSize: 20,
  });

  const notices = sentData?.rows ?? [];
  const total = sentData?.total ?? 0;
  const totalProperties = sentData?.totalProperties ?? (properties?.length || 0);
  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);
  const fromRecord = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toRecord = Math.min(page * pageSize, total);

  const hasActiveFilters = Boolean(searchInput.trim() || propertyId || category);

  const clearFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setPropertyId("");
    setCategory("");
    setPage(1);
  };

  // Mutation
  const sendNoticeMutation = trpc.notices.send.useMutation({
    onSuccess: () => {
      utils.notices.listSent.invalidate();
      setIsCreateOpen(false);
      resetForm();
      toast("Announcement sent successfully", "success");
    },
    onError: (err) => {
      setFormError(err.message || "Failed to send message. Please try again.");
      setIsSubmitting(false);
    },
  });

  const resetForm = () => {
    setTargetType("all");
    setFormPropertyId("");
    setFormUnitId("");
    setTitle("");
    setBody("");
    setType(NoticeType.general);
    setFormError(null);
    setIsSubmitting(false);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim() || !body.trim()) {
      setFormError("Title and message are required.");
      return;
    }

    if (targetType !== "all" && !formPropertyId) {
      setFormError("Please select a property.");
      return;
    }

    if (targetType === "unit" && !formUnitId) {
      setFormError("Please select a unit.");
      return;
    }

    setIsSubmitting(true);
    try {
      await sendNoticeMutation.mutateAsync({
        targetType,
        targetId: targetType === "unit" ? formUnitId : targetType === "property" ? formPropertyId : undefined,
        title: title.trim(),
        body: body.trim(),
        type,
      });
    } catch {
      // Handled by onError
    }
  };

  // Units for create modal
  const selectedFormProperty = properties?.find((p) => p.id === formPropertyId);
  const formUnits = selectedFormProperty?.units || [];

  // Helper for Audience display
  const getAudienceDisplay = (notice: {
    unit?: { unitNumber: string; property?: { name: string } | null } | null;
    property?: { name: string } | null;
  }) => {
    if (notice.unit) {
      const propName = notice.unit.property?.name || notice.property?.name || "Property";
      return {
        line1: `Unit ${notice.unit.unitNumber}`,
        line2: propName,
        combined: `Unit ${notice.unit.unitNumber} · ${propName}`,
      };
    }
    if (notice.property) {
      return {
        line1: notice.property.name,
        line2: "All units",
        combined: notice.property.name,
      };
    }
    return {
      line1: "All properties",
      line2: `${totalProperties} properties`,
      combined: "All properties",
    };
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageHeader title="Announcements" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
        {/* Title row */}
        <PageTitleRow
          title="Sent messages"
          description="Messages you send appear in your tenants&apos; notifications."
          actions={
            <div className="relative group">
              {/* Desktop primary button */}
              <Button
                onClick={() => setIsCreateOpen(true)}
                size="action"
                className="hidden sm:flex bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
              >
                <Plus className="w-4 h-4" />
                Create message
              </Button>

              {/* Mobile icon-only button (36px) */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setIsCreateOpen(true)}
                    className="sm:hidden w-9 h-9 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center shrink-0 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Create message"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="end" className="sm:hidden">
                  Create message
                </TooltipContent>
              </Tooltip>
            </div>
          }
        />

        {/* Toolbar: Search input + Property filter + Category filter */}
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* Search Input: full width on mobile, 280px on desktop */}
          <div className="relative w-full md:w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search messages"
              className="w-full pl-9 pr-8 py-2 rounded-lg bg-card border border-input text-sm text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filters: two per row on mobile, inline on desktop */}
          <div className="grid grid-cols-2 md:flex md:items-center gap-2.5 flex-1">
            <div className="col-span-1 md:w-48">
              <Select
                value={propertyId}
                onChange={(e) => {
                  setPropertyId(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by property"
              >
                <option value="">All properties</option>
                {properties?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="col-span-1 md:w-44">
              <Select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as NoticeType | "");
                  setPage(1);
                }}
                aria-label="Filter by category"
              >
                <option value="">All categories</option>
                {Object.entries(noticeTypeLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="col-span-2 md:col-span-1 text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 py-1 md:py-0 text-left md:text-center"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Content Table / Cards */}
        {isLoadingNotices ? (
          <div className="rounded-xl border border-border bg-card/30 p-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                <div className="space-y-1">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            ))}
          </div>
        ) : total === 0 ? (
          <div className="rounded-xl border border-border bg-card/20 py-16 px-4 text-center">
            {hasActiveFilters ? (
              <div className="max-w-md mx-auto space-y-3">
                <Search className="w-10 h-10 text-muted-foreground mx-auto" />
                <h3 className="text-base font-semibold text-foreground">No messages match your search.</h3>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your search terms or clearing your property and category filters.
                </p>
                <div className="pt-2">
                  <Button
                    onClick={clearFilters}
                    className="bg-card border border-border hover:bg-accent text-foreground text-sm h-9 px-4 rounded-lg font-medium"
                  >
                    Clear filters
                  </Button>
                </div>
              </div>
            ) : (
              <div className="max-w-md mx-auto space-y-3">
                <Inbox className="w-10 h-10 text-muted-foreground mx-auto" />
                <h3 className="text-base font-semibold text-foreground">No messages sent yet</h3>
                <p className="text-sm text-muted-foreground">
                  Messages you send appear in your tenants&apos; notifications.
                </p>
                <div className="pt-2">
                  <Button
                    onClick={() => setIsCreateOpen(true)}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground text-sm h-9 px-4 rounded-lg font-semibold flex items-center gap-1.5 mx-auto"
                  >
                    <Plus className="w-4 h-4" />
                    Create message
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Desktop Table (>=768px) */}
            <div className="hidden md:block rounded-xl border border-border bg-card/40 overflow-hidden">
              <table className="w-full text-left text-sm table-fixed">
                <colgroup>
                  <col className="w-[32%]" />
                  <col className="w-[12%]" />
                  <col className="w-[20%]" />
                  <col className="w-[14%]" />
                  <col className="w-[11%]" />
                  <col className="w-[11%]" />
                </colgroup>
                <thead className="border-b border-border bg-muted/70 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">Message title</th>
                    <th scope="col" className="px-5 py-3.5">Date sent</th>
                    <th scope="col" className="px-5 py-3.5">Audience</th>
                    <th scope="col" className="px-5 py-3.5">Category</th>
                    <th scope="col" className="px-5 py-3.5">Recipients</th>
                    <th scope="col" className="px-5 py-3.5">Read</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {notices.map((notice) => {
                    const audience = getAudienceDisplay(notice);
                    const totalRecipients = notice.recipients.length;
                    const readCount = notice.recipients.filter((r: NoticeRecipientItem) => r.readAt !== null).length;
                    const readPercent = totalRecipients > 0 ? (readCount / totalRecipients) * 100 : 0;

                    return (
                      <tr key={notice.id} className="hover:bg-accent/50 transition-colors">
                        {/* Title: clicking opens full message modal */}
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() => setViewingMessageNotice(notice)}
                            className="text-left font-semibold text-foreground hover:underline truncate max-w-full block"
                            title={notice.title}
                          >
                            {notice.title}
                          </button>
                        </td>

                        {/* Date sent */}
                        <td className="px-5 py-4 text-muted-foreground whitespace-nowrap">
                          {formatDateGB(notice.createdAt)}
                        </td>

                        {/* Audience: Line 1 + Line 2 */}
                        <td className="px-5 py-4">
                          <div className="font-medium text-foreground truncate" title={audience.line1}>
                            {audience.line1}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 truncate" title={audience.line2}>
                            {audience.line2}
                          </div>
                        </td>

                        {/* Category pill */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                              noticeTypeStyles[notice.type as NoticeType] || "bg-muted text-muted-foreground"
                            )}
                          >
                            {noticeTypeLabels[notice.type as NoticeType] || notice.type}
                          </span>
                        </td>

                        {/* Recipients: count + "View recipients" text button */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="text-foreground font-medium">{totalRecipients}</span>
                            <button
                              type="button"
                              onClick={() => setViewingRecipientsNotice(notice)}
                              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                            >
                              View recipients
                            </button>
                          </div>
                        </td>

                        {/* Read: 56px progress bar + count */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-[56px] h-1.5 rounded-full bg-muted overflow-hidden shrink-0">
                              <div
                                className="h-full bg-success rounded-full transition-all duration-300"
                                style={{ width: `${readPercent}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {readCount} of {totalRecipients}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards (<768px) */}
            <div className="md:hidden space-y-3">
              {notices.map((notice) => {
                const audience = getAudienceDisplay(notice);
                const totalRecipients = notice.recipients.length;
                const readCount = notice.recipients.filter((r: NoticeRecipientItem) => r.readAt !== null).length;
                const readPercent = totalRecipients > 0 ? (readCount / totalRecipients) * 100 : 0;

                return (
                  <div
                    key={notice.id}
                    onClick={() => setViewingMessageNotice(notice)}
                    className="rounded-xl border border-border bg-card/40 p-4 space-y-2.5 cursor-pointer active:bg-accent hover:border-border transition-colors"
                  >
                    {/* Title + Category pill */}
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-base text-foreground truncate">{notice.title}</h3>
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0",
                          noticeTypeStyles[notice.type as NoticeType] || "bg-muted text-muted-foreground"
                        )}
                      >
                        {noticeTypeLabels[notice.type as NoticeType] || notice.type}
                      </span>
                    </div>

                    {/* Muted line: Audience · date */}
                    <div className="text-xs text-muted-foreground truncate">
                      {audience.combined} · {formatDateGB(notice.createdAt)}
                    </div>

                    {/* Bottom row: Read bar + "3 of 5" on left, "Recipients" text button on right */}
                    <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-[56px] h-1.5 rounded-full bg-muted overflow-hidden shrink-0">
                          <div
                            className="h-full bg-success rounded-full transition-all duration-300"
                            style={{ width: `${readPercent}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {readCount} of {totalRecipients}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingRecipientsNotice(notice);
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors shrink-0"
                      >
                        Recipients ({totalRecipients})
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border/80">
              <div className="text-sm text-muted-foreground">
                {total === 0 ? "0 of 0" : `${fromRecord}–${toRecord} of ${total}`}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="bg-card border border-border hover:bg-accent text-foreground text-sm h-8 px-3 rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>
                <Button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages}
                  className="bg-card border border-border hover:bg-accent text-foreground text-sm h-8 px-3 rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 1. Create Message Modal */}
        <Modal
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          isSaving={isSubmitting}
          size="lg"
        >
          <ModalHeader
            title="Create message"
            onClose={() => setIsCreateOpen(false)}
            isSaving={isSubmitting}
          />
          <form onSubmit={handleCreateSubmit} className="flex flex-col flex-1 min-h-0">
            <ModalBody className="space-y-6">
              {formError && (
                <div className="p-3 bg-destructive-tint/20 border border-destructive/30 rounded-lg text-destructive text-sm">
                  {formError}
                </div>
              )}

              {/* Audience */}
              <ModalField label="Audience">
                <ModalSegmentedControl
                  value={targetType}
                  onChange={(val) => setTargetType(val as "all" | "property" | "unit")}
                  options={[
                    { value: "all", label: "All Properties" },
                    { value: "property", label: "Single Property" },
                    { value: "unit", label: "Single Unit" },
                  ]}
                />
              </ModalField>

              {/* Property Dropdown (if property or unit selected) */}
              {targetType !== "all" && (
                <ModalField label="Select Property" required>
                  <Select
                    value={formPropertyId}
                    onChange={(e) => {
                      setFormPropertyId(e.target.value);
                      setFormUnitId("");
                    }}
                    required
                    className="h-12"
                  >
                    <option value="">Choose a property...</option>
                    {properties?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </ModalField>
              )}

              {/* Unit Dropdown (if unit selected) */}
              {targetType === "unit" && formPropertyId && (
                <ModalField label="Select Unit" required>
                  <Select
                    value={formUnitId}
                    onChange={(e) => setFormUnitId(e.target.value)}
                    required
                    className="h-12"
                  >
                    <option value="">Choose a unit...</option>
                    {formUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        Unit {u.unitNumber}
                      </option>
                    ))}
                  </Select>
                </ModalField>
              )}

              {/* Category */}
              <ModalField label="Category">
                <Select
                  value={type}
                  onChange={(e) => setType(e.target.value as NoticeType)}
                  className="h-12"
                >
                  {Object.entries(noticeTypeLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </ModalField>

              {/* Subject / Title */}
              <ModalField label="Subject / Title" required>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Water Tank Maintenance This Saturday"
                  className="block w-full h-12 rounded-lg border border-input bg-card px-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring text-sm"
                  required
                />
              </ModalField>

              {/* Message */}
              <ModalField label="Message" required>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Provide details about the announcement..."
                  className="block w-full min-h-[120px] rounded-lg border border-input bg-card p-4 text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring text-sm leading-relaxed"
                  required
                />
              </ModalField>
            </ModalBody>

            <ModalFooter
              onCancel={() => setIsCreateOpen(false)}
              primaryText={isSubmitting ? "Sending..." : "Send"}
              isSaving={isSubmitting}
            />
          </form>
        </Modal>

        {/* 2. Full Message Modal (when title clicked) */}
        <Modal
          open={Boolean(viewingMessageNotice)}
          onOpenChange={(open) => !open && setViewingMessageNotice(null)}
          size="md"
        >
          {viewingMessageNotice && (
            <>
              <ModalHeader
                title={viewingMessageNotice.title}
                description={`${formatDateGB(viewingMessageNotice.createdAt)} · ${noticeTypeLabels[viewingMessageNotice.type as NoticeType] || viewingMessageNotice.type}`}
                onClose={() => setViewingMessageNotice(null)}
              />
              <ModalBody className="space-y-6">
                {/* Audience details */}
                <div className="rounded-lg bg-muted/60 border border-border/80 p-3 text-xs space-y-1">
                  <div className="text-muted-foreground font-medium">Audience</div>
                  <div className="text-foreground font-semibold">
                    {getAudienceDisplay(viewingMessageNotice).combined}
                  </div>
                </div>

                {/* Body */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Message</div>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-muted/40 p-4 rounded-lg border border-border/60">
                    {viewingMessageNotice.body}
                  </p>
                </div>
              </ModalBody>
              <ModalFooter
                primaryText="Close"
                onPrimary={() => setViewingMessageNotice(null)}
              />
            </>
          )}
        </Modal>

        {/* 3. Recipients Modal (when "View recipients" clicked) */}
        <Modal
          open={Boolean(viewingRecipientsNotice)}
          onOpenChange={(open) => !open && setViewingRecipientsNotice(null)}
          size="md"
        >
          {viewingRecipientsNotice && (
            <>
              <ModalHeader
                title="Recipients"
                description={`${viewingRecipientsNotice.title} · ${viewingRecipientsNotice.recipients.length} total`}
                onClose={() => setViewingRecipientsNotice(null)}
              />
              <ModalBody className="space-y-4">
                {viewingRecipientsNotice.recipients.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">No recipients found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-border text-muted-foreground uppercase tracking-wider">
                        <tr>
                          <th scope="col" className="py-2.5 pr-4">Name</th>
                          <th scope="col" className="py-2.5 px-4">Email</th>
                          <th scope="col" className="py-2.5 pl-4 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {viewingRecipientsNotice.recipients.map((r: NoticeRecipientItem) => (
                          <tr key={r.id}>
                            <td className="py-2.5 pr-4 font-medium text-foreground truncate max-w-[120px]">
                              {r.tenant?.fullName || "Tenant"}
                            </td>
                            <td className="py-2.5 px-4 text-muted-foreground truncate max-w-[160px]">
                              {r.tenant?.email || "—"}
                            </td>
                            <td className="py-2.5 pl-4 text-right whitespace-nowrap">
                              {r.readAt ? (
                                <span className="text-success font-medium">
                                  Read {formatDateGB(r.readAt)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Not read yet</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ModalBody>
              <ModalFooter
                primaryText="Done"
                onPrimary={() => setViewingRecipientsNotice(null)}
              />
            </>
          )}
        </Modal>
      </main>
    </div>
  );
}

export default function LandlordNoticesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background text-foreground">
          <PageHeader title="Announcements" />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </main>
        </div>
      }
    >
      <NoticesContent />
    </Suspense>
  );
}
