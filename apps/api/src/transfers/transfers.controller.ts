import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  confirmTransferSchema,
  createTransferSchema,
  type ConfirmTransferInput,
  type CreateTransferInput,
} from "@vault/types";
import type { Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import {
  ResourceNotFoundException,
  ValidationFailedException,
} from "../common/exceptions/domain.exception";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import {
  TransfersService,
  type ConfirmTransferResult,
  type TransferDetailView,
  type TransferView,
} from "./transfers.service";
import { TransfersThrottlerGuard } from "./transfers-throttler.guard";

/** `POST /transfers` rate limit'i (`docs/03_API_CONTRACTS.md` §6 — 10 istek/dk). */
const TRANSFER_RATE_LIMIT = { limit: 10, ttl: 60_000 } as const;

/**
 * Transfer endpoint'leri (`docs/03_API_CONTRACTS.md` §5.4). Base path `/api/v1`
 * `main.ts`'te global prefix ile eklenir → `POST /api/v1/transfers`.
 *
 * `@Roles()` **eklenmez** — her authenticated `User` yalnızca kendi managed
 * cüzdanından transfer başlatır; sahiplik + managed tip kontrolü servis
 * katmanındadır (`TransfersService.createDraft` → `WalletsService`).
 *
 * İterasyon 2: `POST /transfers/:id/confirm` (step-up + guard'lar +
 * `draft → pending_signature`). İterasyon 7 (§5.6b): `GET /transfers/:id`
 * (detay + denetim izi, Admin salt-okunur) + `DELETE /transfers/:id` (yalnızca
 * sahibinin `draft`'ı). Liste ucu `GET /transfers` Faz 6 §6.4'te eklenir.
 */
@Controller("transfers")
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  /**
   * `POST /transfers` — draft transfer oluşturur (`docs/03_API_CONTRACTS.md`
   * §5.4, §7). Zorunlu `Idempotency-Key` header'ı (istemcinin ürettiği UUID);
   * eksikse `VALIDATION_FAILED`. Aynı `(userId, Idempotency-Key)` ile ikinci
   * istek yeni satır açmaz — mevcut transfer `200` ile döner (ilk istek `201`).
   */
  @Post()
  @UseGuards(TransfersThrottlerGuard)
  @Throttle({ default: TRANSFER_RATE_LIMIT })
  async createDraft(
    @CurrentUser("id") userId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createTransferSchema)) body: CreateTransferInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TransferView> {
    if (!idempotencyKey || idempotencyKey.trim() === "") {
      throw new ValidationFailedException([
        { field: "Idempotency-Key", reason: "Bu header zorunludur." },
      ]);
    }

    const { transfer, isNew } = await this.transfersService.createDraft(
      userId,
      body,
      idempotencyKey,
    );
    res.status(isNew ? 201 : 200);
    return transfer;
  }

  /**
   * `POST /transfers/:id/confirm` — step-up authentication (`currentPassword`) +
   * cross-network guard + `(network, asset)` aktiflik + bakiye yeterliliği
   * kontrolünden geçen transfer'i `draft → pending_signature`'a taşır
   * (`docs/03_API_CONTRACTS.md` §5.4). Başarıda `200 { state: 'pending_signature' }`.
   * Kontrol sırası ve hata kodları servis katmanındadır (`TransfersService.confirm`).
   *
   * Biçimsiz `:id` → `404 RESOURCE_NOT_FOUND` (`docs/03` §3 — "yok" ile "geçersiz
   * id" istemci için ayrılmaz). Aynı rate limit'e tabidir (`docs/03` §6 —
   * 10 istek/dk, `userId` anahtarlı).
   */
  @Post(":id/confirm")
  @HttpCode(200)
  @UseGuards(TransfersThrottlerGuard)
  @Throttle({ default: TRANSFER_RATE_LIMIT })
  confirm(
    @CurrentUser("id") userId: string,
    @Param(
      "id",
      new ParseUUIDPipe({
        exceptionFactory: () =>
          new ResourceNotFoundException("Transfer bulunamadı."),
      }),
    )
    transferId: string,
    @Body(new ZodValidationPipe(confirmTransferSchema))
    body: ConfirmTransferInput,
  ): Promise<ConfirmTransferResult> {
    return this.transfersService.confirm(userId, transferId, body.currentPassword);
  }

  /**
   * `GET /transfers/:id` — transfer detay + tam `transfer_state_events` denetim
   * izi (`docs/03_API_CONTRACTS.md` §5.4). `User` yalnızca kendi transfer'ini,
   * `Admin` herhangi birini salt-okunur görür (sahiplik kontrolü servis
   * katmanında). Biçimsiz `:id` → `404 RESOURCE_NOT_FOUND` (`docs/03` §3).
   * S-TRANSFER-DETAIL bu ucu terminal-olmayan durumda 5 sn'de bir çeker.
   */
  @Get(":id")
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param(
      "id",
      new ParseUUIDPipe({
        exceptionFactory: () =>
          new ResourceNotFoundException("Transfer bulunamadı."),
      }),
    )
    transferId: string,
  ): Promise<TransferDetailView> {
    return this.transfersService.getById(user.id, user.role, transferId);
  }

  /**
   * `DELETE /transfers/:id` — yalnızca sahibinin `draft` durumundaki transfer'i
   * silinir (`docs/03_API_CONTRACTS.md` §5.4, `docs/mimari-kararlar.md` W-005).
   * Başarıda `204`. `draft` değil → `409 TRANSFER_INVALID_TRANSITION`; yok /
   * başkasının → `403 FORBIDDEN_NOT_OWNER`. Durum değiştiren bir uç olduğundan
   * `POST` uçlarıyla aynı rate limit'e tabidir (`docs/03` §6, 10 istek/dk,
   * `userId` anahtarlı).
   */
  @Delete(":id")
  @HttpCode(204)
  @UseGuards(TransfersThrottlerGuard)
  @Throttle({ default: TRANSFER_RATE_LIMIT })
  deleteDraft(
    @CurrentUser("id") userId: string,
    @Param(
      "id",
      new ParseUUIDPipe({
        exceptionFactory: () =>
          new ResourceNotFoundException("Transfer bulunamadı."),
      }),
    )
    transferId: string,
  ): Promise<void> {
    return this.transfersService.deleteDraft(userId, transferId);
  }
}
