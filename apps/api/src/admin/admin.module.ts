import { Module } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { AuditModule } from "../audit/audit.module";
import { NetworksModule } from "../networks/networks.module";
import { AdminMintThrottlerGuard } from "./admin-mint-throttler.guard";
import { AdminController } from "./admin.controller";
import { AdminUsersRepository } from "./admin-users.repository";
import { AdminUsersService } from "./admin-users.service";
import { MintRepository } from "./mint.repository";
import { MintService } from "./mint.service";

/**
 * Admin modülü (`docs/04_BACKEND_SPEC.md` §2) — Faz 4 §4.4b'de ilk kez oluşturulur.
 * `mint` + `admin/users`; audit log **okuma** (`GET /admin/audit-logs`) ve
 * kullanıcı detay path alias'ları Faz 6'ya aittir.
 *
 * `AuditModule` → `MINT_EXECUTED` yazımı. `NetworksModule` → `ChainProviderFactory`
 * (mock kontrat `mint()` çağrısı için). `WalletsModule` import **edilmez** —
 * cüzdan/varlık okumaları `MintRepository`'nin kendi Prisma sorgusuyla yapılır
 * (`MovementsModule` ile aynı gerekçe: modüller arası repository sızıntısını
 * önlemek, `docs/04_BACKEND_SPEC.md` §3). `PrismaModule` ve global `ConfigModule`
 * ayrıca import edilmez.
 *
 * `AdminMintThrottlerGuard` / `ThrottlerGuard` provider olarak da kayıtlı —
 * `@UseGuards(...)` ile referans verilen throttler guard'ının DI'ı ve
 * `onModuleInit` hook'u garanti çalışsın (`AuthModule` kalıbı). `ThrottlerModule`
 * kendisi `AuthModule`'de `@Global()` kayıtlıdır.
 */
@Module({
  imports: [AuditModule, NetworksModule],
  controllers: [AdminController],
  providers: [
    MintService,
    MintRepository,
    AdminUsersService,
    AdminUsersRepository,
    ThrottlerGuard,
    AdminMintThrottlerGuard,
  ],
})
export class AdminModule {}
