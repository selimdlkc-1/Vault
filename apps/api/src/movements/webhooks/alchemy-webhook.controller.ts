import { createHmac, timingSafeEqual } from "node:crypto";
import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  type RawBodyRequest,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { Public } from "../../common/decorators/public.decorator";
import { WebhookSignatureInvalidException } from "../../common/exceptions/domain.exception";
import { MovementsService } from "../movements.service";

/**
 * Alchemy `Address Activity` webhook etiketi → `networks.chain_id`. Bu tablo
 * genişletilmez — yeni bir satır yeni bir EVM ağı desteği demektir ve ADR
 * gerektirir (`docs/mimari-kararlar.md` I-001, SEC-005). Değerler seed'deki
 * `chain_id` string'leriyle birebir aynıdır (`apps/api/prisma/seed.ts`).
 */
const CHAIN_ID_BY_ALCHEMY_NETWORK: Readonly<Record<string, string>> = {
  ETH_SEPOLIA: "11155111",
  BNB_TESTNET: "97",
};

/** Alchemy payload'ının bu iterasyonda kullanılan alt kümesi (harici şema, `docs/03` §8). */
interface AlchemyActivity {
  fromAddress?: string;
  toAddress?: string;
  hash?: string;
  rawContract?: { rawValue?: string; address?: string | null; decimals?: number };
}

interface AlchemyWebhookPayload {
  createdAt?: string;
  event?: { network?: string; activity?: AlchemyActivity[] };
}

/**
 * `POST /api/v1/webhooks/alchemy` — EVM ağları (Sepolia, BSC Testnet) için gelen/
 * giden transfer tespiti (`docs/03_API_CONTRACTS.md` §8, `docs/mimari-kararlar.md`
 * I-002). Dosya `movements/` altında yaşar (tek kaynağı EVM olduğundan ayrı bir
 * `webhooks/` üst modülü açılmaz) ama `MovementIndexModule` tarafından register
 * edilir — Tron polling processor'ıyla aynı kuyruk modülü.
 *
 * **Güvenlik (`.claude/rules/03`):** endpoint `@Public()` olduğundan dışarıdan
 * tetiklenebilir bir yazma yoludur. `X-Alchemy-Signature` HMAC doğrulaması
 * **her zaman ilk adımdır**; imza doğrulanmadan hiçbir DB yazımı yapılmaz.
 * İmza uyuşmazsa `401` döner ve payload hiç işlenmez.
 *
 * Bildirim tetiklenmez (`INCOMING_TRANSFER_DETECTED`, Faz 6 §6.1) — yalnızca
 * `chain_movements`'e idempotent yazım.
 */
@Controller()
export class AlchemyWebhookController {
  private readonly logger = new Logger(AlchemyWebhookController.name);
  private readonly signingKey: string;

  constructor(
    config: ConfigService,
    private readonly movements: MovementsService,
  ) {
    this.signingKey = config.getOrThrow<string>("ALCHEMY_WEBHOOK_SIGNING_KEY");
  }

  @Public()
  @Post("webhooks/alchemy")
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-alchemy-signature") signature: string | undefined,
  ): Promise<void> {
    const raw = req.rawBody;
    if (!raw || !this.isValidSignature(raw, signature)) {
      throw new WebhookSignatureInvalidException();
    }

    let payload: AlchemyWebhookPayload;
    try {
      payload = JSON.parse(raw.toString("utf8")) as AlchemyWebhookPayload;
    } catch {
      this.logger.warn("Alchemy webhook gövdesi geçerli JSON değil — atlandı");
      return;
    }

    await this.index(payload);
  }

  /**
   * `HMAC-SHA256(rawBody, ALCHEMY_WEBHOOK_SIGNING_KEY)` hex digest'ini header ile
   * sabit-zamanlı karşılaştırır. Header yoksa veya biçimsizse `false`.
   */
  private isValidSignature(raw: Buffer, signature: string | undefined): boolean {
    if (!signature) {
      return false;
    }
    try {
      const expected = createHmac("sha256", this.signingKey)
        .update(raw)
        .digest("hex");
      const a = Buffer.from(expected, "hex");
      const b = Buffer.from(signature, "hex");
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  /**
   * Payload'daki her aktiviteyi, ilgili adres sistemde kayıtlıysa `chain_movements`'e
   * yazar. Kayıtlı olmayan adres yok sayılır (`docs/03` §8). `createdAt` blok
   * zaman damgası yerine kullanılır (Address Activity payload'ı blok zamanını
   * taşımaz; testnet demo için kabul edilebilir yaklaşım).
   */
  private async index(payload: AlchemyWebhookPayload): Promise<void> {
    const chainId = CHAIN_ID_BY_ALCHEMY_NETWORK[payload.event?.network ?? ""];
    if (!chainId) {
      this.logger.warn(
        `Alchemy webhook: bilinmeyen ağ "${payload.event?.network ?? ""}" — atlandı`,
      );
      return;
    }

    const occurredAt = this.parseOccurredAt(payload.createdAt);
    const activities = payload.event?.activity ?? [];
    let indexed = 0;

    for (const activity of activities) {
      if (!activity.hash) {
        continue;
      }
      const amount = this.rawAmount(activity);
      if (amount === null) {
        continue;
      }
      const contractAddress = activity.rawContract?.address ?? null;

      const legs: ReadonlyArray<["incoming" | "outgoing", string | undefined]> = [
        ["incoming", activity.toAddress],
        ["outgoing", activity.fromAddress],
      ];
      for (const [direction, address] of legs) {
        if (!address) {
          continue;
        }
        const written = await this.movements.indexWebhookMovement({
          chainId,
          address,
          contractAddress,
          txHash: activity.hash,
          direction,
          amount,
          occurredAt,
        });
        if (written) {
          indexed += 1;
        }
      }
    }

    this.logger.debug(`Alchemy webhook: ${indexed} yeni hareket indexlendi`);
  }

  private rawAmount(activity: AlchemyActivity): string | null {
    const hex = activity.rawContract?.rawValue;
    if (typeof hex !== "string" || hex.length === 0) {
      return null;
    }
    try {
      // `BigInt("0x..")` — en küçük birim, JS `number` aritmetiği yok (P-015).
      return BigInt(hex).toString();
    } catch {
      return null;
    }
  }

  private parseOccurredAt(createdAt: string | undefined): Date {
    if (createdAt) {
      const parsed = new Date(createdAt);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return new Date();
  }
}
