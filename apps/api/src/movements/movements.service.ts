import { Injectable, Logger } from "@nestjs/common";
import type { MovementDirection } from "@prisma/client";
import { ValidationFailedException } from "../common/exceptions/domain.exception";
import { PriceCacheService } from "../common/price-cache.service";
import { calculateUsdtValue } from "../common/usdt-conversion.util";
import {
  MovementsRepository,
  type ChainMovementRow,
  type MovementFilters,
} from "./movements.repository";

/**
 * `GET /movements` liste satırı (`docs/03_API_CONTRACTS.md` §5.5). Bu fazda
 * `source` her zaman `'chain'` ve `state` alanı **yoktur** — `transfers` tablosu
 * Faz 5'e kadar oluşmadığından birleşik liste yalnızca zincir tarafını döner
 * (`docs/10` §3.6 notu, `docs/mimari-kararlar.md` W-006).
 */
export interface MovementView {
  source: "chain";
  txHash: string;
  direction: MovementDirection;
  /** En küçük birimde (wei/sun) tutar — `BigInt` string, asla JS `number`. */
  amount: string;
  assetId: string;
  networkId: string;
  occurredAt: string;
  /**
   * Hareketin USDT karşılığı. `chain_movements` kendi bir `valueUsdtAtTime`
   * kolonu tutmaz; değer **anlık** fiyat cache'inden `calculateUsdtValue` ile
   * türetilir (Faz 3 §3.6b İterasyon 9 notu). Fiyat cache'te yoksa `null`.
   */
  valueUsdtAtTime: string | null;
}

/** Bir cüzdanın detay ekranındaki son N zincir hareketi (`GET /wallets/:id`, §5.2). */
export interface WalletChainMovementView {
  txHash: string;
  direction: MovementDirection;
  amount: string;
  assetId: string;
  symbol: string;
  occurredAt: string;
  valueUsdtAtTime: string | null;
}

/** Offset sayfalama meta bloğu (`docs/03_API_CONTRACTS.md` §1). */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/** `GET /movements` servis çıktısı — controller bunu response envelope'una sarar. */
export interface MovementListResult {
  data: MovementView[];
  pagination: PaginationMeta;
}

/** `GET /movements` filtre girdisi (controller `ListMovementsQuery`'den geçirir). */
export interface ListMovementsInput {
  page: number;
  pageSize: number;
  walletId?: string;
  networkId?: string;
  assetId?: string;
  direction?: MovementDirection;
  dateFrom?: Date;
  dateTo?: Date;
  /** Faz 3'te backend'de etkisiz (`source: 'system'` yok) — spec uyumu için kabul edilir. */
  state?: string;
}

/**
 * Tron polling worker'ının çözülmüş `(walletId, assetId)` ile geçtiği hareket
 * (adres→cüzdan eşlemesi `ActiveWalletAssetPair` üzerinden zaten yapılmıştır).
 */
export interface IndexChainMovementInput {
  walletId: string;
  assetId: string;
  txHash: string;
  direction: MovementDirection;
  amount: string;
  occurredAt: Date;
}

/**
 * Alchemy webhook'unun geçtiği ham hareket — ağ `chain_id` etiketiyle, cüzdan/
 * varlık henüz çözülmemiştir (`(chainId→networkId, address, contractAddress)`
 * üzerinden çözülür; herhangi biri eşleşmezse hareket sessizce yok sayılır —
 * `docs/03_API_CONTRACTS.md` §8).
 */
export interface WebhookMovementInput {
  /** `networks.chain_id` (ör. `"11155111"`) — controller Alchemy etiketinden çevirir. */
  chainId: string;
  address: string;
  contractAddress: string | null;
  txHash: string;
  direction: MovementDirection;
  amount: string;
  occurredAt: Date;
}

/**
 * Hareket geçmişi iş mantığı (`.claude/rules/10` service katmanı). `listMovements`
 * yalnızca `chain_movements`'ten okur; `indexChainMovement` / `resolveAndIndex`
 * `movement-index` worker'ının (Alchemy webhook + Tron polling) yazma yollarıdır
 * — bildirim tetiklemez (`INCOMING_TRANSFER_DETECTED` Faz 6 §6.1).
 */
@Injectable()
export class MovementsService {
  private readonly logger = new Logger(MovementsService.name);

  constructor(
    private readonly repository: MovementsRepository,
    private readonly priceCache: PriceCacheService,
  ) {}

  /**
   * `GET /movements` (`docs/03_API_CONTRACTS.md` §5.5). Sahiplik `userId`
   * üzerinden repository sorgusunda zorlanır. Geçersiz tarih aralığında
   * (`dateTo < dateFrom`) `VALIDATION_FAILED`.
   */
  async listMovements(
    userId: string,
    input: ListMovementsInput,
  ): Promise<MovementListResult> {
    if (
      input.dateFrom &&
      input.dateTo &&
      input.dateTo.getTime() < input.dateFrom.getTime()
    ) {
      throw new ValidationFailedException([
        { field: "dateTo", reason: "dateTo, dateFrom'dan önce olamaz." },
      ]);
    }

    const filters: MovementFilters = {
      page: input.page,
      pageSize: input.pageSize,
      walletId: input.walletId,
      networkId: input.networkId,
      assetId: input.assetId,
      direction: input.direction,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    };

    const { items, totalItems } = await this.repository.findByFilters(
      userId,
      filters,
    );

    const data = await Promise.all(items.map((row) => this.toMovementView(row)));

    return {
      data,
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / input.pageSize),
      },
    };
  }

  /**
   * `GET /wallets/:id`'in "son 5 chainMovement" alanı (`docs/03` §5.2) —
   * `WalletsService` bunu İterasyon 8'de boş bırakılan alanı doldurmak için
   * çağırır (`WalletsModule` → `MovementsModule` import).
   */
  async listRecentForWallet(
    walletId: string,
    limit: number,
  ): Promise<WalletChainMovementView[]> {
    const rows = await this.repository.findRecentByWallet(walletId, limit);
    return Promise.all(
      rows.map(async (row) => ({
        txHash: row.txHash,
        direction: row.direction,
        amount: row.amount,
        assetId: row.assetId,
        symbol: row.asset.symbol,
        occurredAt: row.occurredAt.toISOString(),
        valueUsdtAtTime: await this.valueUsdt(row),
      })),
    );
  }

  /**
   * Tron polling worker'ının yazma yolu — cüzdan/varlık zaten çözülmüştür.
   * İdempotent: `(walletId, txHash, direction)` UNIQUE çakışırsa sessizce atlanır.
   *
   * @returns `true` yeni satır yazıldıysa (worker sayaç/log için kullanır).
   */
  indexChainMovement(input: IndexChainMovementInput): Promise<boolean> {
    return this.repository.create({
      walletId: input.walletId,
      assetId: input.assetId,
      txHash: input.txHash,
      direction: input.direction,
      amount: input.amount,
      occurredAt: input.occurredAt,
    });
  }

  /**
   * Alchemy webhook'unun yazma yolu — `chain_id` bir `network`'e, `(networkId,
   * address)` bir kayıtlı cüzdana, `(networkId, contractAddress)` bir varlığa
   * çözülür. Herhangi biri bulunamazsa hareket **sessizce yok sayılır**
   * (`docs/03_API_CONTRACTS.md` §8 — kayıtlı olmayan adrese gelen hareket).
   * Bildirim tetiklenmez (Faz 6 §6.1).
   *
   * @returns `true` yeni satır yazıldıysa; `false` ağ/cüzdan/varlık eşleşmedi
   *   veya hareket zaten indexliydi.
   */
  async indexWebhookMovement(input: WebhookMovementInput): Promise<boolean> {
    const networkId = await this.repository.findNetworkIdByChainId(input.chainId);
    if (!networkId) {
      this.logger.warn(
        `Webhook hareketi atlandı — bilinmeyen chain_id "${input.chainId}"`,
      );
      return false;
    }

    const wallet = await this.repository.findWalletByNetworkAndAddress(
      networkId,
      input.address,
    );
    if (!wallet) {
      return false;
    }

    const asset = await this.repository.findAssetByNetworkAndContract(
      networkId,
      input.contractAddress,
    );
    if (!asset) {
      this.logger.debug(
        `Webhook hareketi atlandı — ağ ${networkId}'de kontrat ` +
          `${input.contractAddress ?? "(native)"} için tanımlı varlık yok`,
      );
      return false;
    }

    return this.repository.create({
      walletId: wallet.id,
      assetId: asset.id,
      txHash: input.txHash,
      direction: input.direction,
      amount: input.amount,
      occurredAt: input.occurredAt,
    });
  }

  private async toMovementView(row: ChainMovementRow): Promise<MovementView> {
    return {
      source: "chain",
      txHash: row.txHash,
      direction: row.direction,
      amount: row.amount,
      assetId: row.assetId,
      networkId: row.wallet.networkId,
      occurredAt: row.occurredAt.toISOString(),
      valueUsdtAtTime: await this.valueUsdt(row),
    };
  }

  /**
   * `docs/mimari-kararlar.md` P-014 formülü (`calculateUsdtValue`) ile hareketin
   * USDT karşılığı — anlık fiyattan (geçmiş fiyat kaydı sistemde yoktur). Fiyat
   * cache'te yoksa `null` (UI'da "—"), hata fırlatılmaz.
   */
  private valueUsdt(row: ChainMovementRow): Promise<string | null> {
    return calculateUsdtValue(
      row.amount,
      row.asset.decimals,
      row.asset.symbol,
      this.priceCache,
    );
  }
}
