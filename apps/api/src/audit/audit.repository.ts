import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

/** `audit_logs` satırı için yazım girdisi (`docs/02_DATABASE_SCHEMA.md` §2.12). */
export interface AuditLogEntry {
  actorType: Prisma.AuditLogUncheckedCreateInput["actorType"];
  /** `actorType = 'system'` veya kimliği henüz doğrulanmamış aktör (login-failed) → `null`. */
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Prisma.InputJsonValue | null;
}

/**
 * `audit_logs` tablosuna yazım (`docs/04_BACKEND_SPEC.md` §1 repository katmanı —
 * yalnızca Prisma çağrısı, iş kuralı yok). Append-only: yalnızca `create`.
 *
 * Çağıran her zaman bir `Prisma.TransactionClient` geçirir; repository kendi
 * transaction'ını açmaz (`docs/04_BACKEND_SPEC.md` §7). `PrismaService` de bu
 * tipin bir üst kümesi olduğundan transaction dışı yazımlarda doğrudan geçirilir.
 */
@Injectable()
export class AuditRepository {
  async create(tx: Prisma.TransactionClient, entry: AuditLogEntry): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorType: entry.actorType,
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        // Metadata yoksa SQL NULL (JSON `null` değeri değil).
        metadata: entry.metadata ?? Prisma.DbNull,
      },
    });
  }
}
