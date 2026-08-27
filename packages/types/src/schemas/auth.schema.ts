import { z } from "zod";

/**
 * Auth istek şemaları — tek doğruluk kaynağı (`docs/04_BACKEND_SPEC.md` §5).
 * Aynı şema hem backend `ZodValidationPipe`'ında hem frontend form doğrulamasında
 * (Faz 1 §1.7) kullanılır; iki yerde kopya şema yazılmaz.
 *
 * Alan kuralları `docs/06_SCREEN_CATALOG.md` §4.1 (S-AUTH-LOGIN / S-AUTH-REGISTER):
 * - E-posta: geçerli format; normalize edilir (trim + lowercase) — login rate-limit
 *   anahtarı (`IP + email`, §1.6) ve benzersizlik kontrolü büyük/küçük harfe
 *   duyarsız kalsın diye.
 * - Şifre (register): en az 8 karakter, en az bir rakam.
 * - Şifre (login): boş olamaz.
 *
 * `.strict()` — şemada tanımlanmayan bir alan gelirse istek reddedilir
 * (mass-assignment koruması, `docs/07_SECURITY_IMPLEMENTATION.md` §6).
 */

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Geçerli bir e-posta adresi girin");

export const registerSchema = z
  .object({
    email,
    password: z
      .string()
      .min(8, "Şifre en az 8 karakter olmalı")
      .regex(/[0-9]/, "Şifre en az bir rakam içermeli"),
  })
  .strict();

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1, "Şifre boş olamaz"),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
