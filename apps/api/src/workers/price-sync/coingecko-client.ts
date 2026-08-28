import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** CoinGecko `simple/price` taban URL'i (`docs/mimari-kararlar.md` I-010). */
const SIMPLE_PRICE_URL = "https://api.coingecko.com/api/v3/simple/price";

/** Demo (public) tier API key header'ı — `COINGECKO_API_KEY` verilmişse eklenir. */
const DEMO_KEY_HEADER = "x-cg-demo-api-key";

/** Tek bir çağrı için üst zaman sınırı — worker'ı asılı kalmaya karşı korur. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * CoinGecko `simple/price` endpoint'ini saran ince HTTP istemcisi (Faz 3 §3.3).
 *
 * Tasarım notları:
 * - **Tek toplu çağrı:** tüm coingecko id'leri `?ids=a,b,c` ile aynı istekte
 *   çekilir; sembol başına ayrı istek public tier rate limit'ine hızla takılır
 *   (`docs/mimari-kararlar.md` I-009, iterasyon Risk notu).
 * - **Auth opsiyonel:** `COINGECKO_API_KEY` varsa demo-tier header'ı eklenir,
 *   yoksa anahtarsız public tier ile devam edilir (`docs/04_BACKEND_SPEC.md` §10).
 * - **Sayısal disiplin:** fiyat, cache'e yazılmadan önce hiçbir noktada JS
 *   `number` aritmetiğine sokulmaz; API'den gelen değer `string` decimal
 *   temsile çevrilip öyle döndürülür (`docs/mimari-kararlar.md` P-015).
 * - Retry/backoff bu sınıfta **yoktur**; hata olduğu gibi fırlatılır ve
 *   çağıran BullMQ job'u (`price-sync.processor`) `attempts` + `backoff` ile
 *   yeniden dener (`docs/04_BACKEND_SPEC.md` §8).
 */
@Injectable()
export class CoingeckoClient {
  private readonly logger = new Logger(CoingeckoClient.name);
  private readonly apiKey?: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>("COINGECKO_API_KEY") || undefined;
  }

  /**
   * Verilen coingecko id'ler için USD fiyatını çeker.
   *
   * @param coingeckoIds Benzersiz id listesi (ör. `["ethereum", "tether"]`).
   * @returns `id → USD fiyatı (string)`. API yanıtında yer almayan id atlanır.
   * @throws Ağ hatası, zaman aşımı veya `2xx` dışı yanıtta.
   */
  async fetchUsdPrices(coingeckoIds: readonly string[]): Promise<Record<string, string>> {
    if (coingeckoIds.length === 0) {
      return {};
    }

    const url = new URL(SIMPLE_PRICE_URL);
    url.searchParams.set("ids", [...coingeckoIds].join(","));
    url.searchParams.set("vs_currencies", "usd");

    const headers: Record<string, string> = { accept: "application/json" };
    if (this.apiKey) {
      headers[DEMO_KEY_HEADER] = this.apiKey;
    }

    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`CoinGecko simple/price ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as Record<string, { usd?: number | string }>;
    const prices: Record<string, string> = {};

    for (const id of coingeckoIds) {
      const usd = body[id]?.usd;
      if (usd === undefined || usd === null) {
        this.logger.warn(`CoinGecko yanıtında "${id}" için usd fiyatı yok — atlandı`);
        continue;
      }
      // `number` aritmetiği yapılmadan doğrudan string temsile çevrilir.
      prices[id] = String(usd);
    }

    return prices;
  }
}
