import { Injectable } from "@nestjs/common";
import type { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** `GET /admin/users` liste satırı — `password_hash` **asla** select edilmez. */
export interface AdminUserRow {
  id: string;
  email: string;
  role: UserRole;
  createdAt: Date;
}

/** `GET /admin/users` sorgu seçenekleri (`docs/03_API_CONTRACTS.md` §5.8). */
export interface SearchUsersOptions {
  email?: string;
  page: number;
  pageSize: number;
}

/**
 * `users` tablosunda admin arama erişimi (`.claude/rules/15-backend-data.md` —
 * yalnızca Prisma çağrısı, iş kuralı yok). Auth modülünün `UsersRepository`'si
 * dışa aktarılmadığından (`docs/04_BACKEND_SPEC.md` §3) admin okuma yolu kendi
 * repository'sini taşır. `select` alan listesi `password_hash`'i hiçbir koşulda
 * içermez (`docs/02_DATABASE_SCHEMA.md` §6).
 */
@Injectable()
export class AdminUsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    options: SearchUsersOptions,
  ): Promise<{ items: AdminUserRow[]; totalItems: number }> {
    const where: Prisma.UserWhereInput = options.email
      ? { email: { contains: options.email, mode: "insensitive" } }
      : {};

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: { id: true, email: true, role: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        skip: (options.page - 1) * options.pageSize,
        take: options.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, totalItems };
  }
}
