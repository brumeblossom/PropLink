'use client';

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
  isSaving?: boolean;
  className?: string;
}

export function Modal({
  open,
  onOpenChange,
  size = "md",
  children,
  isSaving = false,
  className,
}: ModalProps) {
  const sizeClasses = {
    sm: "max-w-[440px]",
    md: "max-w-[540px]",
    lg: "max-w-[680px]",
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSaving && !nextOpen) return;
        onOpenChange(nextOpen);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto pointer-events-none">
          <Dialog.Content
            className={cn(
              "pointer-events-auto relative w-[calc(100%-32px)] sm:w-full rounded-xl bg-card border border-border shadow-2xl p-6 sm:p-8 max-h-[90vh] flex flex-col focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-150",
              sizeClasses[size],
              className
            )}
            onPointerDownOutside={(e) => {
              if (isSaving) e.preventDefault();
            }}
            onEscapeKeyDown={(e) => {
              if (isSaving) e.preventDefault();
            }}
          >
            {children}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export interface ModalHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  onClose?: () => void;
  isSaving?: boolean;
  className?: string;
}

export function ModalHeader({
  title,
  description,
  onClose,
  isSaving = false,
  className,
}: ModalHeaderProps) {
  return (
    <div className={cn("relative shrink-0 mb-7", className)}>
      <div className="flex items-start justify-between gap-4">
        <Dialog.Title className="text-2xl font-bold tracking-tight text-foreground font-sans">
          {title}
        </Dialog.Title>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close"
            className="w-9 h-9 -mr-2 -mt-1 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors shrink-0 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {description && (
        <Dialog.Description className="text-sm text-muted-foreground mt-1">
          {description}
        </Dialog.Description>
      )}
    </div>
  );
}

export interface ModalBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function ModalBody({ children, className }: ModalBodyProps) {
  return (
    <div className={cn("flex-1 overflow-y-auto space-y-6 min-h-0 pr-1 -mr-1", className)}>
      {children}
    </div>
  );
}

export interface ModalFooterProps {
  children?: React.ReactNode;
  onCancel?: () => void;
  cancelText?: string;
  onConfirm?: () => void;
  confirmText?: string;
  onPrimary?: () => void;
  primaryText?: string;
  confirmVariant?: "default" | "destructive";
  variant?: "default" | "destructive";
  isSaving?: boolean;
  disabled?: boolean;
  className?: string;
}

export function ModalFooter({
  children,
  onCancel,
  cancelText = "Cancel",
  onConfirm,
  confirmText,
  onPrimary,
  primaryText,
  confirmVariant = "default",
  variant,
  isSaving = false,
  disabled = false,
  className,
}: ModalFooterProps) {
  const finalPrimaryText = primaryText || confirmText || "Save";
  const finalPrimaryAction = onPrimary || onConfirm;
  const finalVariant = variant || confirmVariant;

  return (
    <div className={cn("shrink-0 border-t border-border mt-8 pt-6", className)}>
      {children ? (
        children
      ) : onCancel ? (
        <div className="grid grid-cols-2 gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSaving}
            className="w-full h-12 rounded-lg text-[15px] font-semibold border-border hover:bg-muted"
          >
            {cancelText}
          </Button>
          <Button
            type={finalPrimaryAction ? "button" : "submit"}
            variant={finalVariant}
            onClick={finalPrimaryAction}
            disabled={isSaving || disabled}
            className="w-full h-12 rounded-lg text-[15px] font-semibold flex items-center justify-center gap-2"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
            {finalPrimaryText}
          </Button>
        </div>
      ) : (
        <Button
          type={finalPrimaryAction ? "button" : "submit"}
          variant={finalVariant}
          onClick={finalPrimaryAction}
          disabled={isSaving || disabled}
          className="w-full h-12 rounded-lg text-[15px] font-semibold flex items-center justify-center gap-2"
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
          {finalPrimaryText}
        </Button>
      )}
    </div>
  );
}

export interface ModalFieldProps {
  label: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function ModalField({
  label,
  htmlFor,
  required,
  hint,
  children,
  className,
}: ModalFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <label
          htmlFor={htmlFor}
          className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>
        {hint && <span className="text-xs text-subtle-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export interface ModalSegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (val: T) => void;
  className?: string;
}

export function ModalSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: ModalSegmentedControlProps<T>) {
  return (
    <div
      className={cn(
        "h-11 bg-muted rounded-lg p-1 flex items-center gap-1 w-full",
        className
      )}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 h-full rounded-md text-xs font-medium transition-all flex items-center justify-center px-2",
              isSelected
                ? "bg-card text-foreground font-semibold shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
