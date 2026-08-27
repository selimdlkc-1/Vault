"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { registerSchema } from "@vault/types";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useRegister } from "@/hooks/use-auth";
import { applyApiError } from "@/lib/form-errors";
import { messages } from "@/lib/messages";

// Backend şeması + yalnızca frontend'de anlamlı "şifre tekrar" alanı
// (docs/06_SCREEN_CATALOG.md §4.1 S-AUTH-REGISTER). Backend'e yalnızca
// { email, password } gönderilir.
const registerFormSchema = registerSchema
  .extend({ passwordConfirm: z.string().min(1, messages.auth.passwordMismatch) })
  .refine((values) => values.password === values.passwordConfirm, {
    message: messages.auth.passwordMismatch,
    path: ["passwordConfirm"],
  });

type RegisterFormValues = z.infer<typeof registerFormSchema>;

/** S-AUTH-REGISTER (docs/06_SCREEN_CATALOG.md §4.1). */
export function RegisterForm() {
  const registerUser = useRegister();
  const [banner, setBanner] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    mode: "onBlur",
    defaultValues: { email: "", password: "", passwordConfirm: "" },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setBanner(null);
    try {
      await registerUser.mutateAsync({ email, password });
    } catch (error) {
      applyApiError(error, setError, setBanner, ["email", "password"]);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {banner ? (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {banner}
        </p>
      ) : null}

      <Field
        label={messages.auth.email}
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <Field
        label={messages.auth.password}
        type="password"
        autoComplete="new-password"
        hint="En az 8 karakter, en az bir rakam."
        error={errors.password?.message}
        {...register("password")}
      />
      <Field
        label={messages.auth.passwordConfirm}
        type="password"
        autoComplete="new-password"
        error={errors.passwordConfirm?.message}
        {...register("passwordConfirm")}
      />

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting
          ? messages.auth.registerSubmitting
          : messages.auth.registerSubmit}
      </Button>

      <Link href="/login" className="text-sm text-primary hover:underline">
        {messages.auth.toLogin}
      </Link>
    </form>
  );
}
