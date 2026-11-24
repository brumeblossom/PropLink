"use client";

import React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "./modal";
import { AlertTriangle } from "lucide-react";

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
  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="sm"
      isSaving={isLoading}
    >
      <ModalHeader
        title={
          <span className="flex items-center gap-2">
            {variant === "danger" && (
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            )}
            <span>{title}</span>
          </span>
        }
        onClose={onClose}
        isSaving={isLoading}
      />
      <ModalBody>
        <p className="text-sm text-foreground/80 leading-relaxed">
          {description}
        </p>
      </ModalBody>
      <ModalFooter
        onCancel={onClose}
        cancelText={cancelText}
        onConfirm={onConfirm}
        confirmText={isLoading ? (variant === "danger" ? "Deleting..." : "Saving...") : confirmText}
        confirmVariant={variant === "danger" ? "destructive" : "default"}
        isSaving={isLoading}
      />
    </Modal>
  );
}
