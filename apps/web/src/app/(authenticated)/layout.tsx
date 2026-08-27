"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LogoutConfirmDialog } from "@/components/features/logout-confirm-dialog";
import { Button } from "@/components/ui/button";
import { useAuthContext } from "@/context/auth-context";
import { messages } from "@/lib/messages";

/**
 * `(authenticated)` layout (docs/06_SCREEN_CATALOG.md §2, docs/05 §2). Asıl oturum
 * kapısı burasıdır: `AuthContext` bootstrap'i (sessiz refresh) `unauthenticated`
 * derse `/login`'e yönlendirir. `middleware.ts` yalnızca ilk isteği hızlandırır.
 */
export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const { status } = useAuthContext();
  const router = useRouter();
  const [logoutOpen, setLogoutOpen] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        {messages.common.loading}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <span className="font-bold text-zinc-900">Vault</span>
        <Button variant="secondary" onClick={() => setLogoutOpen(true)}>
          {messages.dashboard.logout}
        </Button>
      </header>
      <p className="bg-muted px-6 py-1.5 text-center text-xs text-muted-foreground">
        testnet varlıkları — gösterge değerdir
      </p>
      <main className="flex-1 px-6 py-8">{children}</main>

      <LogoutConfirmDialog
        open={logoutOpen}
        onCancel={() => setLogoutOpen(false)}
      />
    </div>
  );
}
