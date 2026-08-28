import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger, type OnModuleInit } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import { ChainProviderFactory } from "../../networks/chain-provider.factory";
import { WalletsService } from "../../wallets/wallets.service";
import type { ActiveWalletAssetPair } from "../../wallets/wallets.repository";

/** Sistemin ilk BullMQ kuyruğu (`docs/04_BACKEND_SPEC.md` §8). */
export const BALANCE_SYNC_QUEUE = "balance-sync";

/** Periyodik fan-out tetikleyicisi — aktif çiftleri tek tek job'a böler. */
export const SYNC_ALL_JOB = "sync-all";
/** Tek bir `(wallet, asset)` çiftinin bakiyesini senkronlayan job. */
export const SYNC_ONE_JOB = "sync-one";

/** `docs/04_BACKEND_SPEC.md` §8 — balance-sync "periyodik (kısa aralıklı)". */
const SYNC_INTERVAL_MS = 60_000;
/** Sabit repeatable job anahtarı — tekrar eklense de tek scheduler kalır. */
const SCHEDULER_JOB_ID = "balance-sync-scheduler";

/**
 * `mimari-kararlar.md` I-006 — RPC çağrılarında exponential backoff, maks 5
 * deneme. `removeOnComplete/Fail`: periyodik fan-out sabit job id ürettiğinden
 * (idempotency) tamamlanan job temizlenmezse bir sonraki tur aynı id'yi
 * ekleyemez; bu yüzden terminal job'lar kuyruktan düşürülür.
 */
const PER_PAIR_JOB_OPTS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: true,
  removeOnFail: true,
} as const;

/** `sync-one` job payload'ı — fan-out adımının ürettiği düz çift. */
export type SyncOnePayload = ActiveWalletAssetPair;

/**
 * `balance-sync` processor'ı (Faz 3 §3.2) — sistemin ilk gerçek worker'ı.
 * Kurduğu kalıp (kuyruk sabiti + `@Processor` + `WorkerHost` + `OnModuleInit`
 * repeatable job kaydı) İterasyon 3/5/8'in temelidir.
 *
 * İki job türü:
 * - `sync-all`: `WalletsService`'ten tüm aktif `(wallet, asset)` çiftlerini alır,
 *   her biri için `(walletId, assetId)`'den türetilmiş sabit job id ile bir
 *   `sync-one` job'u kuyruğa alır (`docs/04_BACKEND_SPEC.md` §8 idempotency).
 * - `sync-one`: ilgili `IChainProvider.getBalance()`'ı çağırır, sonucu
 *   `balance_caches`'e upsert eder. RPC hatası yakalanmaz — job `failed`'e
 *   düşer, BullMQ retry/backoff devralır (`docs/04_BACKEND_SPEC.md` §6).
 *
 * `concurrency: 5` — RPC/TronGrid'e eşzamanlı çağrı sayısını sınırlar
 * (`mimari-kararlar.md` I-009; ayrı bir rate-limit kütüphanesi eklenmez).
 */
@Processor(BALANCE_SYNC_QUEUE, { concurrency: 5 })
export class BalanceSyncProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(BalanceSyncProcessor.name);

  constructor(
    @InjectQueue(BALANCE_SYNC_QUEUE) private readonly queue: Queue,
    private readonly wallets: WalletsService,
    private readonly providers: ChainProviderFactory,
  ) {
    super();
  }

  /** Repeatable fan-out job'unu kaydeder (uygulama açılışında bir kez). */
  async onModuleInit(): Promise<void> {
    await this.queue.add(
      SYNC_ALL_JOB,
      {},
      {
        repeat: { every: SYNC_INTERVAL_MS },
        jobId: SCHEDULER_JOB_ID,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case SYNC_ALL_JOB:
        await this.fanOut();
        return;
      case SYNC_ONE_JOB:
        await this.syncOne(job.data as SyncOnePayload);
        return;
      default:
        this.logger.warn(`Bilinmeyen job adı yok sayıldı: ${job.name}`);
    }
  }

  private async fanOut(): Promise<void> {
    const pairs = await this.wallets.listActiveWalletAssetPairs();

    for (const pair of pairs) {
      await this.queue.add(SYNC_ONE_JOB, pair, {
        ...PER_PAIR_JOB_OPTS,
        jobId: `${BALANCE_SYNC_QUEUE}:${pair.walletId}:${pair.assetId}`,
      });
    }

    this.logger.debug(`${pairs.length} (wallet, asset) çifti kuyruğa alındı`);
  }

  private async syncOne(pair: SyncOnePayload): Promise<void> {
    const provider = this.providers.getProvider({
      chainType: pair.chainType,
      chainId: pair.chainId,
    });

    const balanceRaw = await provider.getBalance(pair.address, {
      contractAddress: pair.assetContractAddress,
      decimals: pair.assetDecimals,
    });

    await this.wallets.saveCachedBalance({
      walletId: pair.walletId,
      assetId: pair.assetId,
      balanceRaw,
    });
  }
}
