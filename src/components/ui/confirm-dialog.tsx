"use client";

import React from "react";
import { Button } from "./button";
import { X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "default";
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Delete",
  cancelText = "Cancel",
  variant = "danger",
  isLoading = false,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in-0 duration-150">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-border">
          <h2 className="text-lg font-bold text-foreground font-sans flex items-center gap-2">
            {variant === "danger" && <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />}
            <span>{title}</span>
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-foreground/80 mb-6 leading-relaxed">
          {description}
        </p>

        <div className="flex space-x-3 pt-2">
          <Button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            variant="outline"
            className="w-1/2 border-border text-foreground hover:bg-muted h-10 text-sm font-medium"
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              "w-1/2 font-semibold h-10 text-sm",
              variant === "danger"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {isLoading ? "Deleting..." : confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
