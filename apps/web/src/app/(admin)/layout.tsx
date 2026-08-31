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
 * `(admin)` layout (docs/06_SCREEN_CATALOG.md §2, docs/05 §2). `middleware.ts`
 * yalnızca refresh cookie varlığını kontrol eder (rol okunamaz); asıl rol
 * zorlaması backend'dedir (`.claude/rules/03` madde 4). Burada rol yalnızca bir
 * UX kısayolu olarak kontrol edilir: admin değilse geçici olarak `/dashboard`'a
 * yönlendirilir — S-FORBIDDEN-403 Faz 7 §7.4'te gelecek.
 *
 * Admin nav: "Ağ / Varlık Yönetimi" (Faz 2 §2.4) + "Mock Mint" (Faz 4 §4.4c).
 * Audit Log (Faz 6 §6.3), Kullanıcılar (Faz 6 §6.4) kendi fazlarında bu listeyi
 * genişletecektir.
 */
const ADMIN_NAV = [
  { href: "/admin/network-assets", label: messages.admin.navNetworkAssets },
  { href: "/admin/mint", label: messages.admin.navMint },
] as const;

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { status, user } = useAuthContext();
  const router = useRouter();
  const pathname = usePathname();
  const [logoutOpen, setLogoutOpen] = useState(false);

  const isAdmin = status === "authenticated" && user?.role === "admin";

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status === "authenticated" && user?.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [status, user, router]);

  if (!isAdmin) {
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
          <nav className="flex gap-4" aria-label="Admin">
            {ADMIN_NAV.map((item) => {
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
        <Button variant="secondary" onClick={() => setLogoutOpen(true)}>
          {messages.dashboard.logout}
        </Button>
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
