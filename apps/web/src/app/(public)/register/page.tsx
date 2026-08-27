import type { Metadata } from "next";
import { RegisterForm } from "@/components/features/auth/register-form";
import { messages } from "@/lib/messages";

export const metadata: Metadata = { title: "Kayıt Ol — Vault" };

export default function RegisterPage() {
  return (
    <section>
      <h1 className="mb-4 text-lg font-semibold text-zinc-900">
        {messages.auth.registerTitle}
      </h1>
      <RegisterForm />
    </section>
  );
}
