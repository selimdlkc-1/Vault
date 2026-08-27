"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { loginSchema, type LoginInput } from "@vault/types";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useLogin } from "@/hooks/use-auth";
import { applyApiError } from "@/lib/form-errors";
import { messages } from "@/lib/messages";

/** S-AUTH-LOGIN (docs/06_SCREEN_CATALOG.md §4.1). */
export function LoginForm() {
  const login = useLogin();
  const [banner, setBanner] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: "onBlur",
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null);
    try {
      await login.mutateAsync(values);
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
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? messages.auth.loginSubmitting : messages.auth.loginSubmit}
      </Button>

      <Link href="/register" className="text-sm text-primary hover:underline">
        {messages.auth.toRegister}
      </Link>
    </form>
  );
}
