'use client';

import React, { useState, useRef } from "react";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatDateGB } from "@/lib/billing";
import { cn } from "@/lib/utils";
import { 
  Upload, 
  FileText, 
  Image as ImageIcon, 
  Trash2, 
  Eye, 
  Loader2 
} from "lucide-react";

interface LeaseDocumentsCardProps {
  leaseId: string;
  mode: "landlord" | "tenant";
  className?: string;
}

interface UploadingFile {
  id: string;
  name: string;
  size: number;
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPdfFile(mimeType?: string | null, name?: string): boolean {
  if (mimeType?.toLowerCase().includes("pdf")) return true;
  if (name?.toLowerCase().endsWith(".pdf")) return true;
  return false;
}

const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];
const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_DOCS_PER_LEASE = 20;

export function LeaseDocumentsCard({ leaseId, mode, className }: LeaseDocumentsCardProps) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const { data: documents, isLoading } = trpc.documents.list.useQuery(
    { leaseId },
    { enabled: !!leaseId }
  );

  const createUploadUrlMutation = trpc.documents.createUploadUrl.useMutation();
  const confirmDocMutation = trpc.documents.confirm.useMutation();
  const deleteDocMutation = trpc.documents.delete.useMutation({
    onSuccess: () => {
      utils.documents.list.invalidate({ leaseId });
      toast("Document deleted", "success");
      setDeletingDocId(null);
    },
    onError: (err) => {
      toast(err.message || "Failed to delete document", "error");
    },
  });

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;

    const currentCount = documents?.length || 0;
    if (currentCount + files.length > MAX_DOCS_PER_LEASE) {
      toast(`Maximum of ${MAX_DOCS_PER_LEASE} documents allowed per lease`, "error");
      return;
    }

    const validFiles: File[] = [];
    for (const file of files) {
      const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
      const isAllowedExt = ALLOWED_EXTENSIONS.includes(ext);
      const isAllowedType = ALLOWED_MIME_TYPES.includes(file.type.toLowerCase());

      if (!isAllowedExt && !isAllowedType) {
        toast("Invalid file type. Only PDF, JPG, and PNG files are allowed", "error");
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        toast("File is larger than 10MB", "error");
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    const queue: UploadingFile[] = validFiles.map((f) => ({
      id: Math.random().toString(36).substring(2, 9),
      name: f.name,
      size: f.size,
    }));

    setUploadingFiles((prev) => [...prev, ...queue]);

    let successCount = 0;

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const queueItem = queue[i];

      try {
        const { signedUrl, path } = await createUploadUrlMutation.mutateAsync({
          leaseId,
          name: file.name,
          size: file.size,
          type: file.type || "application/pdf",
        });

        const uploadRes = await fetch(signedUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type || "application/pdf",
          },
        });

        if (!uploadRes.ok) {
          throw new Error("Failed to upload file to storage.");
        }

        await confirmDocMutation.mutateAsync({
          leaseId,
          name: file.name,
          path,
          size: file.size,
          type: file.type || "application/pdf",
        });

        successCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to upload document";
        toast(message, "error");
      } finally {
        setUploadingFiles((prev) => prev.filter((item) => item.id !== queueItem.id));
      }
    }

    if (successCount > 0) {
      utils.documents.list.invalidate({ leaseId });
      toast(`${successCount} ${successCount === 1 ? "document" : "documents"} uploaded`, "success");
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const handleViewDoc = async (id: string) => {
    try {
      const { signedUrl } = await utils.client.documents.getViewUrl.query({ id });
      window.open(signedUrl, "_blank");
    } catch {
      toast("Could not open document", "error");
    }
  };

  const totalFiles = (documents?.length || 0) + uploadingFiles.length;

  return (
    <div
      onDragOver={(e) => {
        if (mode !== "landlord") return;
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (mode !== "landlord") return;
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={(e) => {
        if (mode !== "landlord") return;
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleFiles(Array.from(e.dataTransfer.files));
        }
      }}
      className={cn(
        "rounded-xl border border-border bg-card/40 p-5 flex flex-col justify-between transition-colors space-y-4",
        isDragging && "border-success/50 bg-success-tint/20 ring-2 ring-success/20",
        className
      )}
    >
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold text-foreground text-lg">Documents</h3>
            <p className="text-muted-foreground text-xs mt-0.5">
              Store and view lease agreements, inventory or receipts.
            </p>
          </div>
          {mode === "landlord" && totalFiles > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs h-8 px-2.5 border-border hover:bg-muted text-foreground shrink-0 flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload
            </Button>
          )}
        </div>

        {/* Hidden Multi-file input for Landlord */}
        {mode === "landlord" && (
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            onChange={handleInputChange}
            className="hidden"
          />
        )}

        {/* Drag overlay hint */}
        {isDragging && (
          <div className="mt-3 rounded-lg border border-dashed border-success/40 bg-success-tint/30 p-3 text-center text-xs text-success font-medium">
            Drop files here to upload
          </div>
        )}

        {/* Document list or empty state */}
        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-2.5">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse border border-border/40" />
              ))}
            </div>
          ) : totalFiles === 0 ? (
            <div className="py-6 text-center">
              {mode === "landlord" ? (
                <div className="flex flex-col items-center justify-center space-y-3">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    No documents yet.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs h-8 px-3 border-border hover:bg-muted text-foreground"
                  >
                    <Upload className="w-3.5 h-3.5 mr-1.5" />
                    Upload
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Your landlord has not uploaded any documents for this lease yet.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-0.5">
              {/* In-progress uploading rows */}
              {uploadingFiles.map((up) => (
                <div
                  key={up.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border bg-muted/40"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center text-muted-foreground shrink-0">
                      <Loader2 className="w-4 h-4 animate-spin text-success" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-foreground truncate" title={up.name}>
                        {up.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground animate-pulse">
                        Uploading... ({formatFileSize(up.size)})
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Uploaded Document Rows */}
              {documents?.map((doc) => {
                const isPdf = isPdfFile(doc.mimeType, doc.name);

                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border/70 bg-card/60 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="shrink-0">
                        {isPdf ? (
                          <div className="w-8 h-8 rounded-lg bg-destructive-tint border border-destructive/30 flex items-center justify-center text-destructive">
                            <FileText className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-kpi-navy-tint border border-kpi-navy/30 flex items-center justify-center text-kpi-navy">
                            <ImageIcon className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-foreground truncate" title={doc.name}>
                          {doc.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {doc.sizeBytes > 0 ? `${formatFileSize(doc.sizeBytes)} · ` : ""}
                          {formatDateGB(doc.createdAt)}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {mode === "landlord" ? (
                        <ActionMenu
                          items={[
                            {
                              label: "View",
                              icon: <Eye className="w-4 h-4" />,
                              onClick: () => handleViewDoc(doc.id),
                            },
                            {
                              label: "Delete",
                              icon: <Trash2 className="w-4 h-4" />,
                              variant: "danger",
                              onClick: () => setDeletingDocId(doc.id),
                            },
                          ]}
                        />
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDoc(doc.id)}
                          className="text-xs h-7 px-2.5 border-border hover:bg-muted text-foreground"
                        >
                          View
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete Document Confirm Dialog (Landlord only) */}
      {mode === "landlord" && (
        <ConfirmDialog
          isOpen={!!deletingDocId}
          onClose={() => setDeletingDocId(null)}
          onConfirm={async () => {
            if (deletingDocId) {
              await deleteDocMutation.mutateAsync({ id: deletingDocId });
            }
          }}
          title="Delete document?"
          description="Are you sure you want to delete this document? This action cannot be undone."
          confirmText="Delete"
          variant="danger"
          isLoading={deleteDocMutation.isPending}
        />
      )}
    </div>
  );
}
