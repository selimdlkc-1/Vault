"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface ToastItem {
  id: number;
  message: string;
}

interface ToastContextValue {
  /**
   * Kısa bir başarı bildirimi gösterir. Rota değişse de görünür kaldığı için
   * "başarı → yönlendirme" akışlarında (S-WALLET-ADD-MANAGED, S-ADMIN-MINT)
   * kullanılır.
   */
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4000;

/**
 * Minimal toast altyapısı (docs/05_FRONTEND_SPEC.md §8 — mutasyon başarısı sonrası
 * "kısa bildirim (toast)"). Kök provider'da mount edilir. Ekstra bir kütüphane
 * (sonner vb.) eklenmez — proje ölçeği gerektirmez (`.claude/rules/01`
 * over-engineering yasağı, `.claude/rules/20` anti-pattern).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <p
            key={toast.id}
            className="pointer-events-auto rounded-md border border-border bg-white px-4 py-2 text-sm text-zinc-900 shadow-lg"
          >
            {toast.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast, <ToastProvider> içinde kullanılmalıdır.");
  }
  return ctx;
}
