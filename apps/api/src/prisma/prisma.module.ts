import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/**
 * Global modül: her domain modülü `PrismaService`'i kendi repository'sine
 * ayrıca import etmeden enjekte edebilir (`docs/04_BACKEND_SPEC.md` §1-3).
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
