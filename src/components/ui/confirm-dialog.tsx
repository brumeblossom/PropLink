"use client";

import React from "react";
import { Button } from "./button";
import { X, AlertTriangle } from "lucide-react";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in-0 duration-150">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-neutral-800">
          <h2 className="text-lg font-bold text-white font-sans flex items-center gap-2">
            {variant === "danger" && <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />}
            <span>{title}</span>
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-neutral-300 mb-6 leading-relaxed">
          {description}
        </p>

        <div className="flex space-x-3 pt-2">
          <Button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            variant="outline"
            className="w-1/2 border-neutral-800 text-white hover:bg-neutral-900 h-[38px]"
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`w-1/2 font-semibold h-[38px] ${
              variant === "danger"
                ? "bg-red-600 hover:bg-red-500 text-white"
                : "bg-white text-black hover:bg-neutral-200"
            }`}
          >
            {isLoading ? "Deleting..." : confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
