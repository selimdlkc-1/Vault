import type { UserRole } from "@prisma/client";

/**
 * `JwtAuthGuard` başarılı doğrulamadan sonra `request.user`'a yazdığı minimal
 * kimlik. Access token payload'ı (`sub`, `role`) buradan türetilir — hassas alan
 * (email, hash) taşınmaz (`docs/07_SECURITY_IMPLEMENTATION.md` §3).
 */
export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- express tip birleştirmesi
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
