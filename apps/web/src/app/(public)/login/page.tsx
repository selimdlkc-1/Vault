import type { Metadata } from "next";
import { LoginForm } from "@/components/features/auth/login-form";
import { messages } from "@/lib/messages";

export const metadata: Metadata = { title: "Giriş Yap — Vault" };

export default function LoginPage() {
  return (
    <section>
      <h1 className="mb-4 text-lg font-semibold text-zinc-900">
        {messages.auth.loginTitle}
      </h1>
      <LoginForm />
    </section>
  );
}
