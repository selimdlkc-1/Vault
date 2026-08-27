"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  /** Verilmezse modal kapatılamaz (ör. zorunlu S-SESSION-EXPIRED). */
  onDismiss?: () => void;
  title: string;
  children: ReactNode;
  footer: ReactNode;
}

/**
 * Native `<dialog>` tabanlı modal (docs/05_FRONTEND_SPEC.md §8). Odak tuzağı,
 * `Escape` ile kapanma ve tetikleyiciye odak dönüşü tarayıcıdan gelir — elle
 * yeniden implemente edilmez.
 */
export function Modal({ open, onDismiss, title, children, footer }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (!onDismiss) {
          event.preventDefault();
          return;
        }
        onDismiss();
      }}
      className="m-auto w-[min(90vw,26rem)] rounded-lg border border-border p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 id={titleId} className="text-lg font-semibold text-zinc-900">
          {title}
        </h2>
        <div className="text-sm text-zinc-700">{children}</div>
        <div className="flex justify-end gap-2">{footer}</div>
      </div>
    </dialog>
  );
}
