import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger, type OnModuleInit } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import type { ActiveWalletAssetPair } from "../../wallets/wallets.repository";
import { WalletsService } from "../../wallets/wallets.service";
import { MovementsService } from "../../movements/movements.service";
import { TrongridMovementClient } from "./trongrid-movement-client";

/** `movement-index` kuyruğu (`docs/04_BACKEND_SPEC.md` §8). */
export const MOVEMENT_INDEX_QUEUE = "movement-index";

/** Periyodik fan-out — tüm Tron TRC-20 çiftlerini tek tek job'a böler. */
export const POLL_ALL_JOB = "poll-all";
/** Tek bir Tron `(wallet, asset)` çiftinin TRC-20 hareketlerini tarayan job. */
export const POLL_ONE_JOB = "poll-one";

/**
 * Tron polling aralığı. Alchemy EVM tarafında push (webhook) çalışır; Tron'da
 * webhook olmadığından periyodik çekme yapılır (`docs/mimari-kararlar.md` I-002).
 * 60 sn `balance-sync`/`price-sync` ile aynı granülerlik.
 */
const POLL_INTERVAL_MS = 60_000;

/** Sabit repeatable job anahtarı — tekrar eklense de tek scheduler kalır. */
const SCHEDULER_JOB_ID = "movement-index-tron-scheduler";

/**
 * `mimari-kararlar.md` I-006 kalıbı (`balance-sync` ile aynı): repeatable fan-out
 * sabit job id ürettiğinden tamamlanan `poll-one` job'ları kuyruktan düşürülür ki
 * bir sonraki tur aynı id'yi ekleyebilsin.
 */
const PER_PAIR_JOB_OPTS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: true,
  removeOnFail: true,
} as const;

/** `poll-one` job payload'ı — fan-out adımının ürettiği düz Tron çifti. */
export type PollOnePayload = ActiveWalletAssetPair;

/**
 * `movement-index` worker'ının Tron tarafı (Faz 3 §3.6a). EVM tarafı
 * `AlchemyWebhookController`'dır — ikisi de aynı kuyruk modülünde yaşar.
 *
 * İki job türü (`balance-sync` kalıbı):
 * - `poll-all`: `WalletsService`'ten aktif `(wallet, asset)` çiftlerini alır,
 *   Tron + TRC-20 (kontrat adresli) olanları `(walletId, assetId)`'den türetilmiş
 *   sabit job id ile `poll-one` olarak kuyruğa alır.
 * - `poll-one`: TronGrid'den o çiftin TRC-20 transferlerini çeker, her birini
 *   `MovementsService.indexChainMovement()` ile yazar. İdempotency
 *   `(walletId, txHash, direction)` UNIQUE kısıtındadır (`docs/04` §8) — aynı
 *   `tx_hash` iki tur üst üste taransa da tek satır kalır. TronGrid hatası
 *   yakalanmaz; job `failed`'e düşer, BullMQ retry/backoff devralır.
 *
 * `concurrency: 3` — TronGrid'e eşzamanlı çağrı sayısını sınırlar
 * (`mimari-kararlar.md` I-009).
 */
@Processor(MOVEMENT_INDEX_QUEUE, { concurrency: 3 })
export class TronMovementPollProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(TronMovementPollProcessor.name);

  constructor(
    @InjectQueue(MOVEMENT_INDEX_QUEUE) private readonly queue: Queue,
    private readonly wallets: WalletsService,
    private readonly movements: MovementsService,
    private readonly trongrid: TrongridMovementClient,
  ) {
    super();
  }

  /** Repeatable fan-out job'unu kaydeder (uygulama açılışında bir kez). */
  async onModuleInit(): Promise<void> {
    await this.queue.add(
      POLL_ALL_JOB,
      {},
      {
        repeat: { every: POLL_INTERVAL_MS },
        jobId: SCHEDULER_JOB_ID,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case POLL_ALL_JOB:
        await this.fanOut();
        return;
      case POLL_ONE_JOB:
        await this.pollOne(job.data as PollOnePayload);
        return;
      default:
        this.logger.warn(`Bilinmeyen job adı yok sayıldı: ${job.name}`);
    }
  }

  private async fanOut(): Promise<void> {
    const pairs = await this.wallets.listActiveWalletAssetPairs();
    const tronTrc20 = pairs.filter(
      (pair) => pair.chainType === "tron" && pair.assetContractAddress !== null,
    );

    for (const pair of tronTrc20) {
      await this.queue.add(POLL_ONE_JOB, pair, {
        ...PER_PAIR_JOB_OPTS,
        jobId: `${MOVEMENT_INDEX_QUEUE}:${pair.walletId}:${pair.assetId}`,
      });
    }

    this.logger.debug(`${tronTrc20.length} Tron TRC-20 çifti kuyruğa alındı`);
  }

  private async pollOne(pair: PollOnePayload): Promise<void> {
    // `assetContractAddress` fan-out filtresinde null olamaz; tip daraltma için.
    if (pair.assetContractAddress === null) {
      return;
    }

    const transfers = await this.trongrid.fetchTrc20Transfers(
      pair.address,
      pair.assetContractAddress,
    );

    let indexed = 0;
    for (const transfer of transfers) {
      const direction = this.directionFor(pair.address, transfer);
      if (direction === null) {
        continue;
      }
      const written = await this.movements.indexChainMovement({
        walletId: pair.walletId,
        assetId: pair.assetId,
        txHash: transfer.txHash,
        direction,
        amount: transfer.value,
        occurredAt: transfer.occurredAt,
      });
      if (written) {
        indexed += 1;
      }
    }

    if (indexed > 0) {
      this.logger.debug(
        `Tron ${pair.walletId}/${pair.assetId}: ${indexed} yeni hareket indexlendi`,
      );
    }
  }

  private directionFor(
    walletAddress: string,
    transfer: { fromAddress: string; toAddress: string },
  ): "incoming" | "outgoing" | null {
    if (transfer.toAddress === walletAddress) {
      return "incoming";
    }
    if (transfer.fromAddress === walletAddress) {
      return "outgoing";
    }
    return null;
  }
}
