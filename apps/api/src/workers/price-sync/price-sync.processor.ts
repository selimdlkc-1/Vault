import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger, type OnModuleInit } from "@nestjs/common";
import { ASSET_PRICE_MAP } from "@vault/types";
import type { Job, Queue } from "bullmq";
import { PriceCacheService } from "../../common/price-cache.service";
import { CoingeckoClient } from "./coingecko-client";

/** `docs/04_BACKEND_SPEC.md` §8 — `price-sync` kuyruğu. */
export const PRICE_SYNC_QUEUE = "price-sync";

/** Periyodik tetiklenen tek job türü — tüm fiyatları tek turda yeniler. */
export const SYNC_PRICES_JOB = "sync-prices";

/** `docs/04_BACKEND_SPEC.md` §8 — `price-sync` "periyodik (60 saniyede bir)". */
const SYNC_INTERVAL_MS = 60_000;

/** Sabit repeatable job anahtarı — tekrar eklense de tek scheduler kalır. */
const SCHEDULER_JOB_ID = "price-sync-scheduler";

/**
 * `mimari-kararlar.md` I-006 / `docs/04` §8 — CoinGecko çağrısında exponential
 * backoff, maks 5 deneme. Sabit job id (idempotency) ürettiğimizden terminal
 * job'lar kuyruktan düşürülür ki bir sonraki tur aynı id'yi ekleyebilsin.
 */
const JOB_OPTS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: true,
  removeOnFail: true,
} as const;

/**
 * `price-sync` processor'ı (Faz 3 §3.3) — `balance-sync`'in kurduğu kuyruk/DI
 * kalıbını izler (kuyruk sabiti + `@Processor` + `WorkerHost` + `OnModuleInit`
 * repeatable job kaydı).
 *
 * Her turda `ASSET_PRICE_MAP`'teki tüm coingecko id'lerini **tek bir toplu
 * CoinGecko çağrısıyla** çeker (`mimari-kararlar.md` I-009 — sembol başına ayrı
 * çağrı public tier rate limit'ine takılır) ve her sonucu `PriceCacheService`
 * ile 60 sn TTL'li cache'e yazar.
 *
 * **Fail-open:** CoinGecko hatasında job `failed`'e düşer (BullMQ retry devralır),
 * ama mevcut cache değerlerine **dokunulmaz** — TTL'leri dolana kadar geçerli
 * kalırlar. Worker asla bu hatayı dashboard'a yansıyan bir exception'a çevirmez
 * (iterasyon Risk notu). `concurrency: 1` — aynı anda tek CoinGecko isteği.
 */
@Processor(PRICE_SYNC_QUEUE, { concurrency: 1 })
export class PriceSyncProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(PriceSyncProcessor.name);

  constructor(
    @InjectQueue(PRICE_SYNC_QUEUE) private readonly queue: Queue,
    private readonly coingecko: CoingeckoClient,
    private readonly priceCache: PriceCacheService,
  ) {
    super();
  }

  /** Repeatable fiyat-yenileme job'unu kaydeder (uygulama açılışında bir kez). */
  async onModuleInit(): Promise<void> {
    await this.queue.add(
      SYNC_PRICES_JOB,
      {},
      {
        repeat: { every: SYNC_INTERVAL_MS },
        jobId: SCHEDULER_JOB_ID,
        ...JOB_OPTS,
      },
    );
  }

  async process(job: Job): Promise<void> {
    if (job.name !== SYNC_PRICES_JOB) {
      this.logger.warn(`Bilinmeyen job adı yok sayıldı: ${job.name}`);
      return;
    }
    await this.syncPrices();
  }

  private async syncPrices(): Promise<void> {
    const symbols = Object.keys(ASSET_PRICE_MAP);
    const coingeckoIds = [...new Set(Object.values(ASSET_PRICE_MAP))];

    // CoinGecko hatası buradan yukarı fırlar → job `failed`, cache'e hiç
    // yazılmaz (fail-open: eski değerler TTL'lerine kadar korunur).
    const pricesById = await this.coingecko.fetchUsdPrices(coingeckoIds);

    let written = 0;
    for (const symbol of symbols) {
      const usdPrice = pricesById[ASSET_PRICE_MAP[symbol]];
      if (usdPrice === undefined) {
        this.logger.warn(`"${symbol}" için CoinGecko fiyatı gelmedi — cache güncellenmedi`);
        continue;
      }
      await this.priceCache.set(symbol, usdPrice);
      written += 1;
    }

    this.logger.debug(`${written}/${symbols.length} varlık fiyatı cache'lendi`);
  }
}
