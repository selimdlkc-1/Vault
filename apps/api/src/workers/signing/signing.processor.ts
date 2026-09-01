import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import { ChainProviderFactory } from "../../networks/chain-provider.factory";
import { PrismaService } from "../../prisma/prisma.service";
import { TransferStateMachine } from "../../transfers/transfer-state-machine.service";
import {
  TransfersService,
  type SigningContext,
} from "../../transfers/transfers.service";
import { EnvelopeEncryptionService } from "../../wallets/envelope-encryption.service";
import { WalletsService } from "../../wallets/wallets.service";
import {
  BROADCAST_JOB,
  BROADCAST_JOB_OPTS,
  BROADCAST_QUEUE,
} from "../broadcast/broadcast.queue";
import { SIGN_JOB, SIGNING_QUEUE, type SignJobData } from "./signing.queue";

/**
 * `signing` worker'ı (Faz 5 §5.3, `docs/01_DOMAIN_MODEL.md` §5.2
 * `pending_signature → signed`). `TransfersService.confirm()` bir transfer'i
 * `pending_signature`'a taşıdıktan sonra bu kuyruğa `{ transferId }` bırakır.
 * Worker:
 *
 * 1. `TransfersService.getSigningContext` ile transfer + ağ/varlık bağlamını
 *    çeker; `null` dönerse (transfer yok **veya** `state !== 'pending_signature'`)
 *    hiçbir yan etki üretmeden çıkar — restart sonrası tekrar kuyruğa alınan bir
 *    job veya terminal durumdaki bir transfer için idempotency
 *    (`docs/04_BACKEND_SPEC.md` §8). Ayrı bir "processing lock" eklenmez.
 * 2. `WalletsService.getSigningMaterial` ile gönderen managed cüzdanın envelope
 *    ciphertext'lerini alır, `EnvelopeEncryptionService.decryptPrivateKey` ile
 *    **yalnızca bu metodun yerel `const`'unda** çözer.
 * 3. `IChainProvider.signTransaction(privateKey, input)` ile ağa özel ham işlemi
 *    imzalar (ağa **göndermez** — broadcast Faz 5 §5.4).
 * 4. `TransferStateMachine.transitionTo(..., 'signed', 'worker:signing')`.
 * 5. Geçiş commit olunca `broadcast` kuyruğuna `{ transferId, signedTx }` job'u
 *    bırakır (job id `${transferId}:broadcast` — İterasyon 4 §5.4). Bu job,
 *    `signing`'in aksine BullMQ `attempts: 5` + exponential backoff taşır
 *    (`docs/mimari-kararlar.md` I-006 — broadcast RPC hatası geçici olabilir).
 *
 * **Güvenlik sınırı** (`.claude/rules/03-security-baseline.md` madde 1,
 * `docs/07_SECURITY_IMPLEMENTATION.md` §5): çözülmüş private key hiçbir zaman bir
 * class field'ına atanmaz, hiçbir `this.logger.*` çağrısına argüman geçirilmez,
 * hiçbir job sonucuna / state event metadata'sına yazılmaz — yalnızca `sign()`
 * yerel kapsamında yaşar ve metod dönünce GC'ye bırakılır.
 *
 * **Hata politikası** (`docs/01_DOMAIN_MODEL.md` §5.2): imzalama hatası genelde
 * kalıcıdır (bozuk key, geçersiz adres) — BullMQ `attempts`/`backoff` retry'ı
 * **kullanılmaz**; `try/catch` ile doğrudan `pending_signature → failed`
 * (`failureReason` sadeleştirilmiş). Bu, geçici RPC hatasında retry eden
 * `broadcast` worker'ından (İterasyon 4) kasıtlı olarak farklıdır.
 */
@Processor(SIGNING_QUEUE, { concurrency: 1 })
export class SigningProcessor extends WorkerHost {
  private readonly logger = new Logger(SigningProcessor.name);

  constructor(
    private readonly transfers: TransfersService,
    private readonly stateMachine: TransferStateMachine,
    private readonly wallets: WalletsService,
    private readonly envelope: EnvelopeEncryptionService,
    private readonly providers: ChainProviderFactory,
    private readonly prisma: PrismaService,
    @InjectQueue(BROADCAST_QUEUE) private readonly broadcastQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<SignJobData>): Promise<void> {
    if (job.name !== SIGN_JOB) {
      this.logger.warn(`Bilinmeyen job adı yok sayıldı: ${job.name}`);
      return;
    }

    const { transferId } = job.data;

    const context = await this.transfers.getSigningContext(transferId);
    if (!context) {
      // Transfer yok / zaten `signed` / terminal — idempotent no-op.
      this.logger.debug(
        `Transfer ${transferId} imzalanabilir durumda değil, atlandı.`,
      );
      return;
    }

    try {
      const signedTx = await this.sign(context);
      await this.prisma.$transaction((tx) =>
        this.stateMachine.transitionTo(
          tx,
          transferId,
          "signed",
          "worker:signing",
        ),
      );
      // Geçiş commit oldu → `broadcast` kuyruğuna iş bırak. Job id
      // `${transferId}:broadcast` bileşik anahtarı (`docs/mimari-kararlar.md`
      // I-005) — restart sonrası tekrar imzalama denenirse bile ikinci broadcast
      // job'u BullMQ deduplication ile yok sayılır.
      await this.broadcastQueue.add(
        BROADCAST_JOB,
        { transferId, signedTx },
        { jobId: `${transferId}:broadcast`, ...BROADCAST_JOB_OPTS },
      );
      this.logger.debug(
        `Transfer ${transferId} imzalandı → signed, broadcast kuyruğuna alındı`,
      );
    } catch (error) {
      // İmzalama hatası → doğrudan `failed` (BullMQ retry YOK,
      // `docs/01_DOMAIN_MODEL.md` §5.2). Ham hata yalnızca log'a; state event
      // metadata'sına sadeleştirilmiş neden yazılır.
      this.logger.warn(
        `Transfer ${transferId} imzalama başarısız: ${(error as Error).message}`,
      );
      await this.prisma.$transaction((tx) =>
        this.stateMachine.transitionTo(
          tx,
          transferId,
          "failed",
          "worker:signing",
          {
            failureReason: "İmzalama başarısız oldu.",
            metadata: { step: "signing", reason: "SIGNING_FAILED" },
          },
        ),
      );
    }
  }

  /**
   * Cüzdanın private key'ini bellek-içi çözer ve ağa özel ham işlemi imzalar.
   * Çözülmüş key `privateKey` yerel `const`'unda kalır — bu metod dışına hiçbir
   * biçimde (dönüş, log, field) taşınmaz.
   */
  private async sign(context: SigningContext): Promise<string> {
    const material = await this.wallets.getSigningMaterial(context.walletId);
    const provider = this.providers.getProvider(context.chain);

    const privateKey = this.envelope.decryptPrivateKey(
      material.encryptedPrivateKey,
      material.encryptedDek,
    );

    return provider.signTransaction(privateKey, {
      from: material.address,
      to: context.toAddress,
      amount: context.amount,
      asset: context.asset,
    });
  }
}
