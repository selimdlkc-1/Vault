import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { AuditRepository, type AuditLogEntry } from "./audit.repository";

/**
 * Sabit eylem kodu listesi (`docs/02_DATABASE_SCHEMA.md` §2.12 — `action` kolonu
 * uygulama katmanında enum benzeri sabitlerle sınırlanır). Sonraki fazlar kendi
 * kodlarını (`WALLET_CREATED`, `TRANSFER_STATE_CHANGED`, `MINT_EXECUTED`, ...)
 * bu birleşime ekler.
 */
export type AuditAction =
  | "LOGIN"
  | "LOGIN_FAILED"
  | "NETWORK_ASSET_ACTIVATED"
  | "NETWORK_ASSET_DEACTIVATED"
  | "WALLET_CREATED"
  | "MINT_EXECUTED";

export type AuditRecordInput = Omit<AuditLogEntry, "action"> & {
  action: AuditAction;
};

/**
 * Tüm modüllerin denetim kaydı yazmak için enjekte ettiği ortak servis
 * (`docs/04_BACKEND_SPEC.md` §7, `mimari-kararlar.md` AUD-001).
 *
 * `record()` **kendi transaction'ını açmaz** — çağıranın `Prisma.TransactionClient`'ını
 * repository'ye devreder. Bir state değişikliğine eşlik eden audit yazımı, o
 * değişiklikle aynı `$transaction` içinde çağrılır; ikisi birlikte commit veya
 * rollback olur. Bağımsız bir olay (login, login-failed) için çağıran doğrudan
 * `PrismaService`'i geçirir (transaction client'ının üst kümesidir).
 *
 * Bu, sonraki tüm audit yazımlarının temel kalıbıdır — hiçbir çağıran `record()`
 * içinde ayrı bir `prisma.$transaction` başlatmamalıdır (atomiklik bozulur).
 */
@Injectable()
export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  record(tx: Prisma.TransactionClient, input: AuditRecordInput): Promise<void> {
    return this.repository.create(tx, input);
  }
}
