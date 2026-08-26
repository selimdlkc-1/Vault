import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Tüm domain repository'lerinin enjekte ettiği tek Prisma client instance'ı.
 * Bağlantı yaşam döngüsü NestJS modül yaşam döngüsüne bağlanır
 * (`docs/04_BACKEND_SPEC.md` §1-3 katman sınırı: yalnızca repository katmanı bu servisi kullanır).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
