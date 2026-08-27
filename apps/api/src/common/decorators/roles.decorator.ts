import { SetMetadata } from "@nestjs/common";
import type { UserRole } from "@prisma/client";

/** `Reflector` anahtarı — `RolesGuard` bu metadata'daki rolleri okur. */
export const ROLES_KEY = "roles";

/**
 * `@Roles('admin')` — endpoint'e erişebilecek rolleri işaretler (`docs/04` §4
 * adım 5, `mimari-kararlar.md` AUTH-001/002). Metadata taşımayan bir route,
 * kimlik doğrulaması yeterli olan (rol-agnostik) bir authenticated endpoint'tir.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
