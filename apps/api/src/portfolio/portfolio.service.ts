import { Injectable, Logger } from "@nestjs/common";
import { ValidationFailedException } from "../common/exceptions/domain.exception";
import { PriceCacheService } from "../common/price-cache.service";
import { calculateUsdtValue } from "../common/usdt-conversion.util";
import {
  PortfolioRepository,
  type CreateSnapshotData,
} from "./portfolio.repository";

/** `GET /portfolio/summary` — varlık bazlı bakiye satırı (`docs/03_API_CONTRACTS.md` §5.6). */
export interface PortfolioAssetView {
  assetId: string;
  symbol: string;
  /** En küçük birimde (wei/sun) bakiye — `BigInt` string, asla JS `number`. */
  balanceRaw: string;
  /** USDT karşılığı (18 ondalıklı decimal string) veya fiyat cache'te yoksa `null`. */
  valueUsdt: string | null;
}

/** `GET /portfolio/summary` — cüzdan bazlı grup (`docs/03_API_CONTRACTS.md` §5.6). */
export interface PortfolioWalletView {
  walletId: string;
  networkId: string;
  assets: PortfolioAssetView[];
}

/**
 * `GET /portfolio/summary` yanıtı (`docs/03_API_CONTRACTS.md` §5.6).
 * `totalValueUsdt` `DECIMAL(38,18)` string temsili döner — asla JS `number`
 * olarak serileştirilmez (`docs/mimari-kararlar.md` P-015).
 */
export interface PortfolioSummaryView {
  totalValueUsdt: string;
  wallets: PortfolioWalletView[];
}

/** `GET /portfolio/history` — tek grafik noktası (`docs/03_API_CONTRACTS.md` §5.6). */
export interface PortfolioHistoryPointView {
  timestamp: string;
  totalValueUsdt: string;
  priceSource: string;
}

/** Sabit-nokta ölçeği — `calculateUsdtValue` çıktısı ve `DECIMAL(38,18)` ile hizalı. */
const TOTAL_SCALE_DECIMALS = 18;

/**
 * `calculateUsdtValue`'nun kanonik çıktısını (`^-?\d+\.\d{18}$`) ölçeklenmiş
 * `BigInt`'e çevirir. `usdt-conversion.util.ts`'in private `parseDecimalToScaled`'ı
 * ile benzer; portföy modülü o util'i değiştiremeyeceği ve modül izolasyonu
 * (`.claude/rules/10`) repository paylaşımını yasakladığı için bu hafif tekrar
 * bilinçlidir (iterasyon Risk notu). Toplama hiçbir adımda JS `number` kullanmaz.
 */
function scaledFromFixedString(value: string): bigint {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [intPart, fracPart = ""] = unsigned.split(".");
  const frac = fracPart
    .slice(0, TOTAL_SCALE_DECIMALS)
    .padEnd(TOTAL_SCALE_DECIMALS, "0");
  const scaled = BigInt(`${intPart}${frac}`);
  return negative ? -scaled : scaled;
}

/** Ölçeklenmiş `BigInt`'i 18-ondalıklı sabit `"tam.kesir"` string'ine çevirir. */
function fixedStringFromScaled(value: bigint): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value)
    .toString()
    .padStart(TOTAL_SCALE_DECIMALS + 1, "0");
  const intPart = digits.slice(0, digits.length - TOTAL_SCALE_DECIMALS);
  const fracPart = digits.slice(digits.length - TOTAL_SCALE_DECIMALS);
  return `${negative ? "-" : ""}${intPart}.${fracPart}`;
}

/**
 * Portföy iş mantığı (`.claude/rules/10` service katmanı). `getSummary` canlı
 * fiyatlardan USDT değerlemesi yapar (`docs/mimari-kararlar.md` P-014);
 * `getHistory` yalnızca `portfolio_snapshots`'tan okur, hesaplama yapmaz (P-016).
 * `listUserIdsWithWallets` / `saveSnapshot` `portfolio-snapshot` worker'ının
 * ince passthrough metotlarıdır — worker repository'ye doğrudan erişmez
 * (`docs/04_BACKEND_SPEC.md` §2).
 */
@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    private readonly repository: PortfolioRepository,
    private readonly priceCache: PriceCacheService,
  ) {}

  /**
   * `GET /portfolio/summary` (`docs/03_API_CONTRACTS.md` §5.6). Kullanıcının tüm
   * cüzdan/varlık bakiyeleri `calculateUsdtValue` ile zenginleştirilir; fiyatı
   * eksik olan varlık toplam hesabına dahil **edilmez** (satır yine döner,
   * `valueUsdt: null`), bu durum loglanır ama hata fırlatılmaz (İterasyon 4'ün
   * `null` kararının doğal sonucu).
   */
  async getSummary(userId: string): Promise<PortfolioSummaryView> {
    const wallets = await this.repository.findWalletsWithBalancesByUser(userId);

    let totalScaled = 0n;
    const walletViews: PortfolioWalletView[] = [];

    for (const wallet of wallets) {
      const caches = [...wallet.balanceCaches].sort((a, b) =>
        a.asset.symbol.localeCompare(b.asset.symbol),
      );

      const assets: PortfolioAssetView[] = [];
      for (const cache of caches) {
        const valueUsdt = await calculateUsdtValue(
          cache.balanceRaw,
          cache.asset.decimals,
          cache.asset.symbol,
          this.priceCache,
        );

        if (valueUsdt === null) {
          this.logger.warn(
            `Fiyatı eksik varlık portföy toplamına dahil edilmedi: ` +
              `wallet=${wallet.id} asset=${cache.assetId} (${cache.asset.symbol})`,
          );
        } else {
          totalScaled += scaledFromFixedString(valueUsdt);
        }

        assets.push({
          assetId: cache.assetId,
          symbol: cache.asset.symbol,
          balanceRaw: cache.balanceRaw,
          valueUsdt,
        });
      }

      walletViews.push({
        walletId: wallet.id,
        networkId: wallet.networkId,
        assets,
      });
    }

    return {
      totalValueUsdt: fixedStringFromScaled(totalScaled),
      wallets: walletViews,
    };
  }

  /**
   * `GET /portfolio/history` (`docs/03_API_CONTRACTS.md` §5.6). Yalnızca önceden
   * yazılmış snapshot'lardan okunur (`docs/mimari-kararlar.md` P-016). Geçersiz
   * aralıkta (`dateTo < dateFrom`) `VALIDATION_FAILED`.
   */
  async getHistory(
    userId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<PortfolioHistoryPointView[]> {
    if (dateTo.getTime() < dateFrom.getTime()) {
      throw new ValidationFailedException([
        { field: "dateTo", reason: "dateTo, dateFrom'dan önce olamaz." },
      ]);
    }

    const snapshots = await this.repository.findSnapshotsByUserAndRange(
      userId,
      dateFrom,
      dateTo,
    );

    return snapshots.map((snapshot) => ({
      timestamp: snapshot.createdAt.toISOString(),
      // `Prisma.Decimal` → `DECIMAL(38,18)` string temsili (asla JS `number`).
      totalValueUsdt: snapshot.totalValueUsdt.toFixed(TOTAL_SCALE_DECIMALS),
      priceSource: snapshot.priceSource,
    }));
  }

  /**
   * `portfolio-snapshot` worker'ının tarama kümesi: en az bir cüzdanı olan
   * kullanıcı id'leri (Faz 3 §3.4b).
   */
  listUserIdsWithWallets(): Promise<string[]> {
    return this.repository.findUserIdsWithWallets();
  }

  /**
   * `portfolio-snapshot` worker'ının hesapladığı toplamı `portfolio_snapshots`'a
   * yazar (Faz 3 §3.4b). `totalValueUsdt` `getSummary` çıktısından gelen bir
   * decimal string'idir; servis onu yorumlamaz.
   */
  saveSnapshot(data: CreateSnapshotData): Promise<void> {
    return this.repository.createSnapshot(data);
  }
}
