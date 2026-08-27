"use client";

import { useAuthContext } from "@/context/auth-context";
import { messages } from "@/lib/messages";

/**
 * GEÇİCİ placeholder (Faz 1 §1.7). Gerçek portföy panosu (S-DASHBOARD) Faz 3 §3.5'te
 * bunun yerini alır — bu ekran yalnızca auth akışının yönlendirme hedefidir.
 */
export default function DashboardPage() {
  const { user } = useAuthContext();

  return (
    <section className="mx-auto max-w-lg rounded-xl border border-border p-8">
      <h1 className="text-xl font-semibold text-zinc-900">
        {messages.dashboard.placeholderTitle}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {messages.dashboard.placeholderBody}
      </p>
      {user?.email ? (
        <p className="mt-4 text-sm text-zinc-700">Oturum: {user.email}</p>
      ) : null}
    </section>
  );
}
