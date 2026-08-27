import type { ReactNode } from "react";

/** `(public)` layout (docs/06_SCREEN_CATALOG.md §2) — ortalanmış tek kart, nav yok. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <span className="text-xl font-bold text-zinc-900">Vault</span>
          <p className="mt-1 text-xs text-muted-foreground">
            testnet portföy ve transfer uygulaması
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
