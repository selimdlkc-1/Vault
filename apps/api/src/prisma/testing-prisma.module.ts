import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/**
 * Integration testlerde gerçek DB'ye bağlanmadan `PrismaService`'i sağlayan
 * global fake (`.claude/rules/30-testing.md` — repository'ler bellek-içi fake ile
 * değiştirilir, aynı ilke `PrismaService` için de geçerli).
 *
 * Yalnızca servis katmanının `$transaction` orkestrasyonu için gereken minimal
 * yüzey: callback'i sabit bir fake tx handle ile çalıştırır. Asıl tablo yazımları
 * ilgili repository (ör. `AuditRepository`) bellek-içi fake ile override
 * edildiğinde o fake'e düşer; tx handle yalnızca "aynı transaction" kimliğini
 * taşır.
 */
export const fakePrismaService = {
  $transaction: <T>(cb: (tx: unknown) => Promise<T>): Promise<T> =>
    cb({ __fakeTx: true }),
};

@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: fakePrismaService }],
  exports: [PrismaService],
})
export class TestingPrismaModule {}
