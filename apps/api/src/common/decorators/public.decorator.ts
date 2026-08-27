import { SetMetadata } from "@nestjs/common";

/** `Reflector` anahtarı — `JwtAuthGuard` bu metadata'yı okuyup route'u atlar. */
export const IS_PUBLIC_KEY = "isPublic";

/**
 * `@Public()` — route'u global `JwtAuthGuard`/`RolesGuard` zincirinden muaf tutar
 * (`docs/04_BACKEND_SPEC.md` §4). Yalnızca `register`/`login`/`refresh` taşır.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
