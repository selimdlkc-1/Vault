import { Injectable } from "@nestjs/common";
import type { User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * `users` tablosu erişimi (`docs/04_BACKEND_SPEC.md` §1 repository katmanı —
 * yalnızca sorgu/yazma, iş kuralı yok). Yalnızca `AuthModule` içindeki
 * servislere enjekte edilir, dışarı `export` edilmez.
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  create(data: { email: string; passwordHash: string }): Promise<User> {
    return this.prisma.user.create({ data });
  }
}
