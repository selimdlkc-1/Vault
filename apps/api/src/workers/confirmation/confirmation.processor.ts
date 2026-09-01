import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger, type OnModuleInit } from "@nestjs/common";
import {
  CONFIRMATION_THRESHOLDS,
  type TransactionReceipt,
} from "@vault/chain-providers";
import type { Job, Queue } from "bullmq";
import { TransferInvalidTransitionException } from "../../common/exceptions/domain.exception";
import { ChainProviderFactory } from "../../networks/chain-provider.factory";
import { PrismaService } from "../../prisma/prisma.service";
import {
  type TransitionOptions,
  TransferStateMachine,
} from "../../transfers/transfer-state-machine.service";
import {
  type ConfirmationContext,
  TransfersService,
} from "../../transfers/transfers.service";
import {
  CONFIRMATION_POLL_INTERVAL_MS,
  CONFIRMATION_POLL_ONE_OPTS,
  CONFIRMATION_QUEUE,
  CONFIRMATION_SCHEDULER_JOB_ID,
  type ConfirmationJobData,
  confirmationJobId,
  POLL_ALL_JOB,
  POLL_ONE_JOB,
} from "./confirmation.queue";

/**
 * Ağa özel "bloğa hiç girmeden geçen süre" eşiği — bu süre aşılırsa işlem
 * mempool'dan düşmüş sayılır ve transfer `dropped`'a geçer
 * (`docs/01_DOMAIN_MODEL.md` §5.2). `docs/mimari-kararlar.md` I-004'ün (blok
 * eşiği) ötesinde bir uygulama detayı; testnet blok sürelerine göre seçilir.
 */
const MEMPOOL_DROP_TIMEOUT_MS: Readonly<Record<string, number>> = {
  "11155111": 30 * 60_000, // Sepolia
  "97": 20 * 60_000, // BSC Testnet
  shasta: 15 * 60_000, // Tron Shasta
};

/** Bilinmeyen `chain_id` için güvenli varsayılan zaman aşımı. */
const DEFAULT_DROP_TIMEOUT_MS = 30 * 60_000;

/**
 * `confirmation` worker'ı (Faz 5 §5.5, `docs/01_DOMAIN_MODEL.md` §5.2
 * `broadcast → confirming → confirmed/dropped/failed`). `balance-sync` /
 * `movement-index` kalıbı: sürekli çalışan tek repeatable scheduler (`poll-all`)
 * her turda `broadcast`/`confirming` durumundaki transfer'leri `poll-one` job'una
 * fan-out eder. Terminal transfer'ler `TransfersService.listInFlightTransferIds`
 * sorgusundan doğal olarak dışlanır — polling kendiliğinden durur, per-transfer
 * repeatable job yaşam döngüsü yönetilmez.
 *
 * `BroadcastProcessor` başarılı broadcast'in sonunda ilk `poll-one`'u anında
 * kuyruğa alır (aynı `confirmationJobId` → scheduler ile dedup) — ilk kontrol
 * için 15 sn beklenmez.
 *
 * `poll-one` mantığı (`docs/04_BACKEND_SPEC.md` §8, `docs/mimari-kararlar.md`
 * I-004/I-007):
 * - Bağlam `null` (terminal / yok / henüz `broadcast` öncesi) → sessizce çık.
 * - `getTransactionReceipt` RPC hatası → yutulur, bir sonraki tur yeniden dener
 *   (polling zaten tekrar eder; worker kendi retry döngüsünü yazmaz).
 * - `reverted` → `failed` (sadeleştirilmiş neden).
 * - Bloğa hiç girmemiş + ağa özel zaman aşımı aşıldı → `dropped`.
 * - Bloğa ilk giriş (`broadcast` durumundayken) → `confirming` (blok hash'i state
 *   event metadata'sına yazılır — reorg referansı).
 * - `confirming` + `depth = currentBlockHeight - blockNumber >= eşik` → `confirmed`.
 * - `confirming` + block hash mismatch (reorg) → **state geçişi değil**; yalnızca
 *   iç blok hash referansı güncellenir, bu tur `confirmed`'e geçilmez, sayaç
 *   sıfırlanmaz (`docs/mimari-kararlar.md` I-007) — depth zaten her turda taze
 *   `blockNumber`'dan yeniden hesaplandığından bir sonraki tur doğru derinlikten
 *   devam eder.
 *
 * Terminal-durum guard'ı ve whitelist kontrolü `TransferStateMachine`'de tek
 * noktada (`.claude/rules/13-critical-modules.md`).
 */
@Processor(CONFIRMATION_QUEUE, { concurrency: 3 })
export class ConfirmationProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(ConfirmationProcessor.name);

  /**
   * `transferId → son görülen blok hash'i` (yalnızca EVM). Reorg'dan sonra
   * güncellenir ki bir sonraki tur mismatch'i tekrar "reorg" sanmasın ve işlem
   * yeni zincirde eşik derinliğe ulaşınca `confirmed` olabilsin. Süreç-içi
   * (`docs/mimari-kararlar.md` I-007 "iç sayaç/metadata"); restart sonrası
   * `ConfirmationContext.confirmingBlockHash`'ten (ilk giriş) yeniden beslenir.
   */
  private readonly lastBlockHash = new Map<string, string>();

  constructor(
    @InjectQueue(CONFIRMATION_QUEUE) private readonly queue: Queue,
    private readonly transfers: TransfersService,
    private readonly stateMachine: TransferStateMachine,
    private readonly providers: ChainProviderFactory,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  /** Repeatable fan-out job'unu kaydeder (uygulama açılışında bir kez). */
  async onModuleInit(): Promise<void> {
    await this.queue.add(
      POLL_ALL_JOB,
      {},
      {
        repeat: { every: CONFIRMATION_POLL_INTERVAL_MS },
        jobId: CONFIRMATION_SCHEDULER_JOB_ID,
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
        await this.pollOne((job.data as ConfirmationJobData).transferId);
        return;
      default:
        this.logger.warn(`Bilinmeyen job adı yok sayıldı: ${job.name}`);
    }
  }

  private async fanOut(): Promise<void> {
    const transferIds = await this.transfers.listInFlightTransferIds();
    for (const transferId of transferIds) {
      await this.queue.add(
        POLL_ONE_JOB,
        { transferId } satisfies ConfirmationJobData,
        { ...CONFIRMATION_POLL_ONE_OPTS, jobId: confirmationJobId(transferId) },
      );
    }
    if (transferIds.length > 0) {
      this.logger.debug(`${transferIds.length} transfer onay kontrolüne alındı`);
    }
  }

  private async pollOne(transferId: string): Promise<void> {
    const context = await this.transfers.getConfirmationContext(transferId);
    if (!context) {
      // Terminal / yok / henüz izlenmiyor — polling durur.
      this.lastBlockHash.delete(transferId);
      return;
    }

    let receipt: TransactionReceipt;
    try {
      receipt = await this.providers
        .getProvider(context.chain)
        .getTransactionReceipt(context.txHash);
    } catch (error) {
      // RPC hatası → state geçişi yapma; bir sonraki tur yeniden dener.
      this.logger.warn(
        `Transfer ${transferId} makbuz okunamadı, sonraki tur denenecek: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }

    await this.evaluate(context, receipt);
  }

  private async evaluate(
    context: ConfirmationContext,
    receipt: TransactionReceipt,
  ): Promise<void> {
    const { transferId, chain } = context;

    // (1) Bloğa girdi ama execution revert etti (EVM) / FAILED (Tron) → failed.
    if (receipt.status === "reverted") {
      this.lastBlockHash.delete(transferId);
      await this.transition(transferId, "failed", {
        failureReason: "İşlem zincir tarafından reddedildi.",
        metadata: { step: "confirmation", reason: "TX_REVERTED" },
      });
      return;
    }

    // (2) Henüz bloğa girmedi (veya reorg bloktan düşürdü) → zaman aşımı = dropped.
    if (receipt.status === "pending" || receipt.blockNumber === null) {
      const elapsedMs = Date.now() - context.updatedAt.getTime();
      const timeoutMs =
        MEMPOOL_DROP_TIMEOUT_MS[chain.chainId] ?? DEFAULT_DROP_TIMEOUT_MS;
      if (elapsedMs > timeoutMs) {
        this.lastBlockHash.delete(transferId);
        await this.transition(transferId, "dropped", {
          // `dropped` revert değildir — `failureReason` doldurulmaz
          // (`docs/01_DOMAIN_MODEL.md` §5.2).
          metadata: { step: "confirmation", reason: "MEMPOOL_DROP" },
        });
      }
      return;
    }

    // (3) İlk bloğa giriş — `broadcast` durumundayken → `confirming`.
    if (context.state === "broadcast") {
      if (receipt.blockHash !== null) {
        this.lastBlockHash.set(transferId, receipt.blockHash);
      }
      await this.transition(transferId, "confirming", {
        metadata: {
          step: "confirmation",
          blockNumber: receipt.blockNumber,
          ...(receipt.blockHash !== null
            ? { blockHash: receipt.blockHash }
            : {}),
        },
      });
      // Derinlik değerlendirmesi bir sonraki turda (ilk görülmede depth ~0).
      return;
    }

    // (4) `confirming` durumunda — reorg kontrolü + derinlik eşiği.
    const knownBlockHash =
      this.lastBlockHash.get(transferId) ?? context.confirmingBlockHash;
    if (
      knownBlockHash !== null &&
      receipt.blockHash !== null &&
      knownBlockHash !== receipt.blockHash
    ) {
      // Reorg (block hash mismatch) — state geçişi DEĞİL
      // (`docs/mimari-kararlar.md` I-007). Yalnızca iç blok hash referansı
      // güncellenir; sayaç sıfırlanmaz, `confirming`'de kalınır, bu tur
      // `confirmed`'e geçilmez (bir sonraki tur taze derinlikle yeniden doğrular).
      this.logger.warn(
        `Transfer ${transferId} reorg tespit edildi (blok hash ${knownBlockHash} → ${receipt.blockHash}); confirming'de tutuluyor, sayaç sıfırlanmıyor.`,
      );
      this.lastBlockHash.set(transferId, receipt.blockHash);
      return;
    }
    if (receipt.blockHash !== null) {
      this.lastBlockHash.set(transferId, receipt.blockHash);
    }

    const threshold = CONFIRMATION_THRESHOLDS[chain.chainId];
    if (threshold === undefined) {
      throw new Error(
        `chain_id "${chain.chainId}" için onay eşiği tanımlı değil.`,
      );
    }
    const depth = receipt.currentBlockHeight - receipt.blockNumber;
    if (depth >= threshold) {
      this.lastBlockHash.delete(transferId);
      await this.transition(transferId, "confirmed", {
        metadata: { step: "confirmation", blockNumber: receipt.blockNumber, depth },
      });
    }
  }

  /**
   * `transitionTo`'yu `$transaction` içinde çağırır; transfer arada terminal/başka
   * duruma geçmişse `TransferInvalidTransitionException`'ı idempotent no-op olarak
   * yutar (`BroadcastProcessor.failTransfer` kalıbı).
   */
  private async transition(
    transferId: string,
    toState: "confirming" | "confirmed" | "failed" | "dropped",
    options?: TransitionOptions,
  ): Promise<void> {
    try {
      await this.prisma.$transaction((tx) =>
        this.stateMachine.transitionTo(
          tx,
          transferId,
          toState,
          "worker:confirmation",
          options,
        ),
      );
      this.logger.debug(`Transfer ${transferId} → ${toState}`);
    } catch (error) {
      if (error instanceof TransferInvalidTransitionException) {
        this.logger.debug(
          `Transfer ${transferId} ${toState} geçişi atlandı — durum eşzamanlı değişmiş.`,
        );
        return;
      }
      throw error;
    }
  }
}
