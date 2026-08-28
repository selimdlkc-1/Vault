import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger, type OnModuleInit } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import { PortfolioService } from "../../portfolio/portfolio.service";

/** `docs/04_BACKEND_SPEC.md` §8 — `portfolio-snapshot` kuyruğu. */
export const PORTFOLIO_SNAPSHOT_QUEUE = "portfolio-snapshot";

/** Periyodik tetiklenen tek job türü — tüm kullanıcıların portföyünü dondurur. */
export const SNAPSHOT_ALL_JOB = "snapshot-all";

/** `price_source` sabiti — şimdilik tek fiyat kaynağı (`docs/02` §2.14). */
const PRICE_SOURCE = "coingecko";

/**
 * Snapshot periyodu. `balance-sync`/`price-sync` 60 sn'dir; portföy geçmiş
 * grafiği için o granülerlik gereksizce çok satır üretir (retention politikası
 * yok, `docs/02` §7) — 5 dakikalık aralık demo veri setini küçük tutar ve grafik
 * için yeterli çözünürlük verir.
 */
const SNAPSHOT_INTERVAL_MS = 5 * 60_000;

/** Sabit repeatable job anahtarı — tekrar eklense de tek scheduler kalır. */
const SCHEDULER_JOB_ID = "portfolio-snapshot-scheduler";

/**
 * `mimari-kararlar.md` I-006 kalıbı — repeatable job'un sabit id'si (idempotency)
 * yüzünden terminal job'lar kuyruktan düşürülür ki bir sonraki tur aynı id'yi
 * ekleyebilsin. `attempts` düşük: snapshot append-only'dir, bir turun retry'ı
 * o kullanıcı için mükerrer satır yazabileceğinden `process` zaten kullanıcı
 * bazında hata yalıtır (aşağıya bkz.).
 */
const JOB_OPTS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: true,
  removeOnFail: true,
} as const;

/**
 * `portfolio-snapshot` processor'ı (Faz 3 §3.4b) — `price-sync`'in kurduğu
 * kuyruk/DI kalıbını izler (kuyruk sabiti + `@Processor` + `WorkerHost` +
 * `OnModuleInit` repeatable job kaydı).
 *
 * Her turda en az bir cüzdanı olan tüm kullanıcıları tarar; her biri için
 * `PortfolioService.getSummary(userId)`'yi çağırıp dönen `totalValueUsdt`'yi
 * `portfolio_snapshots`'a insert eder (`priceSource: 'coingecko'`). Snapshot
 * append-only olduğu ve her tur kasıtlı yeni bir kayıt olduğu için idempotency
 * anahtarı **uygulanmaz** (`docs/04` §8 "job türüne göre").
 *
 * **Kullanıcı bazında hata yalıtımı:** bir kullanıcının özeti hesaplanamazsa
 * (beklenmedik bir hata) o kullanıcı atlanır ve loglanır; job yine `completed`
 * olur — böylece bir retry, zaten snapshot'lanmış kullanıcılara mükerrer satır
 * yazmaz. Fiyat eksikliği zaten `getSummary` içinde `null`'a indirgenir, hata
 * fırlatmaz.
 *
 * `concurrency: 1` — snapshot turu hafiftir, paralelleştirme gereksizdir.
 */
@Processor(PORTFOLIO_SNAPSHOT_QUEUE, { concurrency: 1 })
export class PortfolioSnapshotProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(PortfolioSnapshotProcessor.name);

  constructor(
    @InjectQueue(PORTFOLIO_SNAPSHOT_QUEUE) private readonly queue: Queue,
    private readonly portfolio: PortfolioService,
  ) {
    super();
  }

  /** Repeatable snapshot job'unu kaydeder (uygulama açılışında bir kez). */
  async onModuleInit(): Promise<void> {
    await this.queue.add(
      SNAPSHOT_ALL_JOB,
      {},
      {
        repeat: { every: SNAPSHOT_INTERVAL_MS },
        jobId: SCHEDULER_JOB_ID,
        ...JOB_OPTS,
      },
    );
  }

  async process(job: Job): Promise<void> {
    if (job.name !== SNAPSHOT_ALL_JOB) {
      this.logger.warn(`Bilinmeyen job adı yok sayıldı: ${job.name}`);
      return;
    }
    await this.snapshotAll();
  }

  private async snapshotAll(): Promise<void> {
    const userIds = await this.portfolio.listUserIdsWithWallets();

    let written = 0;
    for (const userId of userIds) {
      try {
        const summary = await this.portfolio.getSummary(userId);
        await this.portfolio.saveSnapshot({
          userId,
          totalValueUsdt: summary.totalValueUsdt,
          priceSource: PRICE_SOURCE,
        });
        written += 1;
      } catch (error) {
        this.logger.warn(
          `Kullanıcı ${userId} için snapshot atlandı: ${(error as Error).message}`,
        );
      }
    }

    this.logger.debug(`${written}/${userIds.length} kullanıcı portföyü snapshot'landı`);
  }
}
