"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { TestnetDisclaimer } from "@/components/composite/testnet-disclaimer";
import { LogoutConfirmDialog } from "@/components/features/logout-confirm-dialog";
import { Button } from "@/components/ui/button";
import { useAuthContext } from "@/context/auth-context";
import { messages } from "@/lib/messages";

/**
 * `(authenticated)` layout (docs/06_SCREEN_CATALOG.md §2, docs/05 §2). Asıl oturum
 * kapısı burasıdır: `AuthContext` bootstrap'i (sessiz refresh) `unauthenticated`
 * derse `/login`'e yönlendirir. `middleware.ts` yalnızca ilk isteği hızlandırır.
 *
 * Nav bar Faz 3 §3.5a'da eklendi. "Hareketler" linki İterasyon 9'a (S-MOVEMENTS)
 * kadar geçici bir placeholder route'a gider (Faz 1/2 placeholder disiplini);
 * bildirim ikonu Faz 6 §6.1'e kadar pasif/statiktir.
 */
const NAV = [
  { href: "/dashboard", label: messages.nav.dashboard },
  { href: "/wallets", label: messages.nav.wallets },
  { href: "/movements", label: messages.nav.movements },
] as const;

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const { status } = useAuthContext();
  const router = useRouter();
  const pathname = usePathname();
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
        <div className="flex items-center gap-8">
          <span className="font-bold text-zinc-900">Vault</span>
          <nav className="flex gap-4" aria-label="Ana menü">
            {NAV.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`text-sm ${
                    active
                      ? "font-medium text-primary"
                      : "text-zinc-700 hover:text-zinc-900"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span
            aria-label={messages.nav.notificationsAriaLabel}
            title={messages.nav.notificationsAriaLabel}
            className="text-lg text-muted-foreground"
          >
            🔔
          </span>
          <Button variant="secondary" onClick={() => setLogoutOpen(true)}>
            {messages.dashboard.logout}
          </Button>
        </div>
      </header>
      <TestnetDisclaimer />
      <main className="flex-1 px-6 py-8">{children}</main>

      <LogoutConfirmDialog
        open={logoutOpen}
        onCancel={() => setLogoutOpen(false)}
      />
    </div>
  );
}
