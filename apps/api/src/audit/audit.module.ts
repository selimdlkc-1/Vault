import { Module } from "@nestjs/common";
import { AuditRepository } from "./audit.repository";
import { AuditService } from "./audit.service";

/**
 * Denetim kaydı yazma altyapısı (`docs/04_BACKEND_SPEC.md` §2/§7). `AuditService`
 * dışa aktarılır; denetim kaydı yazan her domain modülü (`NetworksModule`,
 * `AuthModule`, sonraki fazlarda `WalletsModule`/`TransfersModule`/`AdminModule`)
 * bunu `imports`'a ekler. `AuditRepository` dışa aktarılmaz — yalnızca bu modülün
 * servisi kullanır. `PrismaModule` global olduğundan ayrıca import edilmez.
 */
@Module({
  providers: [AuditService, AuditRepository],
  exports: [AuditService],
})
export class AuditModule {}
