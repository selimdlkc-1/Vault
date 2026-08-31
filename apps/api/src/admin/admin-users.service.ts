import { Injectable } from "@nestjs/common";
import type { UserRole } from "@prisma/client";
import type { ListAdminUsersQuery } from "@vault/types";
import { AdminUsersRepository } from "./admin-users.repository";

/** `GET /admin/users` liste satırı (`docs/03_API_CONTRACTS.md` §5.8). */
export interface AdminUserView {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

/** Offset sayfalama meta bloğu (`docs/03_API_CONTRACTS.md` §1). */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/** `GET /admin/users` servis çıktısı — controller bunu response envelope'una sarar. */
export interface AdminUserListResult {
  data: AdminUserView[];
  pagination: PaginationMeta;
}

/**
 * Admin kullanıcı arama iş mantığı (`.claude/rules/10` service katmanı).
 * S-ADMIN-MINT'in kullanıcı seçim alanının bağımlı olduğu okuma yolu
 * (`docs/03_API_CONTRACTS.md` §5.8 notu); Faz 6'nın admin kullanıcı ekranları da
 * bunu yeniden kullanır. Yanıt yalnızca `id`/`email`/`role`/`createdAt` taşır —
 * `password_hash` repository `select`'inde hiç yer almaz.
 */
@Injectable()
export class AdminUsersService {
  constructor(private readonly repository: AdminUsersRepository) {}

  async search(query: ListAdminUsersQuery): Promise<AdminUserListResult> {
    const { items, totalItems } = await this.repository.search({
      email: query.email,
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      data: items.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        createdAt: row.createdAt.toISOString(),
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }
}
