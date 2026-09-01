import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { classifyRpcError } from "@vault/chain-providers";
import type { Job, Queue } from "bullmq";
import { TransferInvalidTransitionException } from "../../common/exceptions/domain.exception";
import { ChainProviderFactory } from "../../networks/chain-provider.factory";
import { PrismaService } from "../../prisma/prisma.service";
import { TransferStateMachine } from "../../transfers/transfer-state-machine.service";
import { TransfersService } from "../../transfers/transfers.service";
import {
  CONFIRMATION_POLL_ONE_OPTS,
  CONFIRMATION_QUEUE,
  POLL_ONE_JOB,
  confirmationJobId,
} from "../confirmation/confirmation.queue";
import { BROADCAST_JOB, BROADCAST_QUEUE, type BroadcastJobData } from "./broadcast.queue";

/**
 * `broadcast` worker'ı (Faz 5 §5.4, `docs/01_DOMAIN_MODEL.md` §5.2
 * `signed → broadcast`). `SigningProcessor` bir transfer'i `signed`'e taşıdıktan
 * sonra bu kuyruğa `{ transferId, signedTx }` bırakır. Worker:
 *
 * 1. `TransfersService.getBroadcastContext` ile ağ bağlamını çeker; `null`
 *    dönerse (transfer yok **veya** `state !== 'signed'`) hiçbir yan etki
 *    üretmeden çıkar — restart sonrası tekrar kuyruğa alınan job veya zaten
 *    `broadcast`/terminal durumdaki transfer için idempotency
 *    (`docs/04_BACKEND_SPEC.md` §8, `docs/mimari-kararlar.md` I-005).
 * 2. `IChainProvider.broadcastTransaction(signedTx)` ile imzalı işlemi ağa
 *    gönderir.
 * 3. **Başarı:** `TransferStateMachine.transitionTo(..., 'broadcast', ..., { txHash })`
 *    — `transfers.tx_hash` bu geçişte **aynı `$transaction` içinde** dolar.
 * 4. **Hata:** `classifyRpcError(cause)` ile ayrılır —
 *    - `'permanent'` (nonce/gas/bakiye, imzalı işlem artık geçersiz) → tek
 *      denemede `signed → failed`.
 *    - `'transient'` (RPC/ağ dalgalanması) → exception **yeniden fırlatılır**;
 *      BullMQ'nun kuyruk-seviyesi `attempts: 5` + `backoff: exponential` retry'ı
 *      devralır (`docs/04_BACKEND_SPEC.md` §6, §8 — worker kendi retry döngüsünü
 *      yazmaz). Son deneme de tükenmişse (`attemptsMade + 1 >= attempts`) burada
 *      `signed → failed`'e geçirilir ki BullMQ'nun sessiz `failed` job durumu
 *      transfer'i `signed`'de asılı bırakmasın.
 *
 * Terminal-durum guard'ı ve whitelist kontrolü `TransferStateMachine`'de tek
 * noktada — bu worker ayrı bir terminal-state kontrolü icat etmez
 * (`.claude/rules/13-critical-modules.md`).
 */
@Processor(BROADCAST_QUEUE, { concurrency: 1 })
export class BroadcastProcessor extends WorkerHost {
  private readonly logger = new Logger(BroadcastProcessor.name);

  constructor(
    private readonly transfers: TransfersService,
    private readonly stateMachine: TransferStateMachine,
    private readonly providers: ChainProviderFactory,
    private readonly prisma: PrismaService,
    @InjectQueue(CONFIRMATION_QUEUE) private readonly confirmationQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<BroadcastJobData>): Promise<void> {
    if (job.name !== BROADCAST_JOB) {
      this.logger.warn(`Bilinmeyen job adı yok sayıldı: ${job.name}`);
      return;
    }

    const { transferId, signedTx } = job.data;

    const context = await this.transfers.getBroadcastContext(transferId);
    if (!context) {
      // Transfer yok / zaten `broadcast` / terminal — idempotent no-op.
      this.logger.debug(
        `Transfer ${transferId} yayınlanabilir durumda değil, atlandı.`,
      );
      return;
    }

    const provider = this.providers.getProvider(context.chain);

    let txHash: string;
    try {
      const result = await provider.broadcastTransaction(signedTx);
      txHash = result.txHash;
    } catch (error) {
      await this.handleBroadcastError(job, transferId, error);
      return;
    }

    await this.prisma.$transaction((tx) =>
      this.stateMachine.transitionTo(
        tx,
        transferId,
        "broadcast",
        "worker:broadcast",
        { txHash },
      ),
    );
    this.logger.debug(`Transfer ${transferId} ağa gönderildi → broadcast (${txHash})`);

    // Geçiş commit oldu → `confirmation` kuyruğuna ilk `poll-one`'u anında bırak
    // (İterasyon 5 §5.5). Job id `confirmation:${transferId}` — `confirmation`
    // scheduler'ının fan-out'u da aynı id'yi ürettiğinden çift kontrol BullMQ
    // deduplication ile engellenir (`docs/mimari-kararlar.md` I-005).
    await this.confirmationQueue.add(
      POLL_ONE_JOB,
      { transferId },
      { ...CONFIRMATION_POLL_ONE_OPTS, jobId: confirmationJobId(transferId) },
    );
  }

  /**
   * Kalıcı hata → doğrudan `failed`. Geçici hata → son deneme değilse exception'ı
   * yeniden fırlatır (BullMQ retry devralır); son denemeyse `failed`'e geçirir.
   */
  private async handleBroadcastError(
    job: Job<BroadcastJobData>,
    transferId: string,
    error: unknown,
  ): Promise<void> {
    const kind = classifyRpcError(error);
    const rawMessage = error instanceof Error ? error.message : String(error);

    if (kind === "permanent") {
      this.logger.warn(
        `Transfer ${transferId} broadcast kalıcı hata: ${rawMessage}`,
      );
      await this.failTransfer(transferId, "İşlem ağ tarafından reddedildi.");
      return;
    }

    const attempts = job.opts.attempts ?? 1;
    const isLastAttempt = job.attemptsMade + 1 >= attempts;
    if (isLastAttempt) {
      this.logger.warn(
        `Transfer ${transferId} broadcast geçici hata — ${attempts} deneme tükendi: ${rawMessage}`,
      );
      await this.failTransfer(transferId, "Ağ zaman aşımı.");
      return;
    }

    this.logger.warn(
      `Transfer ${transferId} broadcast geçici hata (deneme ${job.attemptsMade + 1}/${attempts}), yeniden denenecek: ${rawMessage}`,
    );
    // BullMQ'ya devret — kuyruk seviyesindeki `attempts`/`backoff` retry eder.
    throw error;
  }

  /**
   * `signed → failed` geçişi. Ham hata mesajı `failure_reason`'a / state event
   * metadata'sına **yazılmaz** — sadeleştirilmiş neden verilir
   * (`docs/01_DOMAIN_MODEL.md` §5.2). Transfer arada terminal duruma geçmişse
   * `TransferStateMachine` `TransferInvalidTransitionException` fırlatır; bu
   * idempotent no-op olarak yutulur.
   */
  private async failTransfer(transferId: string, reason: string): Promise<void> {
    try {
      await this.prisma.$transaction((tx) =>
        this.stateMachine.transitionTo(
          tx,
          transferId,
          "failed",
          "worker:broadcast",
          {
            failureReason: reason,
            metadata: { step: "broadcast", reason: "BROADCAST_FAILED" },
          },
        ),
      );
    } catch (error) {
      if (error instanceof TransferInvalidTransitionException) {
        this.logger.debug(
          `Transfer ${transferId} zaten terminal/geçersiz durumda — failed geçişi atlandı.`,
        );
        return;
      }
      throw error;
    }
  }
}
