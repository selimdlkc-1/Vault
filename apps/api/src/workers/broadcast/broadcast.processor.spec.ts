import type { Job } from "bullmq";
import type { IChainProvider } from "@vault/chain-providers";
import { TransferInvalidTransitionException } from "../../common/exceptions/domain.exception";
import type { ChainProviderFactory } from "../../networks/chain-provider.factory";
import type { PrismaService } from "../../prisma/prisma.service";
import type { TransferStateMachine } from "../../transfers/transfer-state-machine.service";
import type {
  BroadcastContext,
  TransfersService,
} from "../../transfers/transfers.service";
import { BroadcastProcessor } from "./broadcast.processor";
import { BROADCAST_JOB, type BroadcastJobData } from "./broadcast.queue";

const TRANSFER_ID = "99999999-9999-4999-8999-999999999999";
const SIGNED_TX = "0xSIGNEDRAWTX";
const TX_HASH = `0x${"ab".repeat(32)}`;
const TX = { __tx: true };

function context(overrides: Partial<BroadcastContext> = {}): BroadcastContext {
  return {
    transferId: TRANSFER_ID,
    chain: { chainType: "evm", chainId: "11155111" },
    ...overrides,
  };
}

function job(
  overrides: Partial<Job<BroadcastJobData>> = {},
  data: BroadcastJobData = { transferId: TRANSFER_ID, signedTx: SIGNED_TX },
  name = BROADCAST_JOB,
): Job<BroadcastJobData> {
  return {
    name,
    data,
    opts: { attempts: 5 },
    attemptsMade: 0,
    ...overrides,
  } as unknown as Job<BroadcastJobData>;
}

describe("BroadcastProcessor", () => {
  let transfers: jest.Mocked<Pick<TransfersService, "getBroadcastContext">>;
  let stateMachine: jest.Mocked<Pick<TransferStateMachine, "transitionTo">>;
  let providers: jest.Mocked<Pick<ChainProviderFactory, "getProvider">>;
  let provider: jest.Mocked<Pick<IChainProvider, "broadcastTransaction">>;
  let prisma: { $transaction: jest.Mock };
  let processor: BroadcastProcessor;

  beforeEach(() => {
    transfers = {
      getBroadcastContext: jest.fn().mockResolvedValue(context()),
    };
    stateMachine = {
      transitionTo: jest.fn().mockResolvedValue(undefined),
    };
    provider = {
      broadcastTransaction: jest.fn().mockResolvedValue({ txHash: TX_HASH }),
    };
    providers = { getProvider: jest.fn().mockReturnValue(provider) };
    prisma = {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(TX)),
    };
    processor = new BroadcastProcessor(
      transfers as unknown as TransfersService,
      stateMachine as unknown as TransferStateMachine,
      providers as unknown as ChainProviderFactory,
      prisma as unknown as PrismaService,
    );
  });

  it("başarı: signedTx ağa gönderilir, signed → broadcast geçişinde tx_hash aynı $transaction'da yazılır", async () => {
    await processor.process(job());

    expect(providers.getProvider).toHaveBeenCalledWith({
      chainType: "evm",
      chainId: "11155111",
    });
    expect(provider.broadcastTransaction).toHaveBeenCalledWith(SIGNED_TX);
    expect(stateMachine.transitionTo).toHaveBeenCalledWith(
      TX,
      TRANSFER_ID,
      "broadcast",
      "worker:broadcast",
      { txHash: TX_HASH },
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("idempotency: getBroadcastContext null (zaten broadcast/terminal) → hiçbir yan etki yok", async () => {
    transfers.getBroadcastContext.mockResolvedValue(null);

    await processor.process(job());

    expect(providers.getProvider).not.toHaveBeenCalled();
    expect(provider.broadcastTransaction).not.toHaveBeenCalled();
    expect(stateMachine.transitionTo).not.toHaveBeenCalled();
  });

  it("bilinmeyen job adı: sessizce çıkar", async () => {
    await processor.process(job({}, { transferId: TRANSFER_ID, signedTx: SIGNED_TX }, "garip"));

    expect(transfers.getBroadcastContext).not.toHaveBeenCalled();
  });

  it("kalıcı RPC hatası (INSUFFICIENT_FUNDS): tek denemede signed → failed, exception fırlatılmaz", async () => {
    provider.broadcastTransaction.mockRejectedValue(
      Object.assign(new Error("insufficient funds for gas"), {
        code: "INSUFFICIENT_FUNDS",
      }),
    );

    await expect(processor.process(job())).resolves.toBeUndefined();

    expect(stateMachine.transitionTo).toHaveBeenCalledTimes(1);
    expect(stateMachine.transitionTo).toHaveBeenCalledWith(
      TX,
      TRANSFER_ID,
      "failed",
      "worker:broadcast",
      {
        failureReason: "İşlem ağ tarafından reddedildi.",
        metadata: { step: "broadcast", reason: "BROADCAST_FAILED" },
      },
    );
  });

  it("geçici hata + son deneme değil: exception yeniden fırlatılır (BullMQ retry devralır), failed'e düşmez", async () => {
    provider.broadcastTransaction.mockRejectedValue(new Error("request timeout"));

    await expect(
      processor.process(job({ attemptsMade: 1 })),
    ).rejects.toThrow("request timeout");

    expect(stateMachine.transitionTo).not.toHaveBeenCalled();
  });

  it("geçici hata + son deneme: signed → failed ('Ağ zaman aşımı.'), exception fırlatılmaz", async () => {
    provider.broadcastTransaction.mockRejectedValue(new Error("ETIMEDOUT connect"));

    await expect(
      processor.process(job({ attemptsMade: 4 })),
    ).resolves.toBeUndefined();

    expect(stateMachine.transitionTo).toHaveBeenCalledWith(
      TX,
      TRANSFER_ID,
      "failed",
      "worker:broadcast",
      expect.objectContaining({ failureReason: "Ağ zaman aşımı." }),
    );
  });

  it("tanınmayan hata → güvenli varsayılan transient: son deneme değilse yeniden fırlatılır", async () => {
    provider.broadcastTransaction.mockRejectedValue(new Error("weird provider glitch"));

    await expect(processor.process(job({ attemptsMade: 0 }))).rejects.toThrow();
    expect(stateMachine.transitionTo).not.toHaveBeenCalled();
  });

  it("failed geçişi sırasında transfer terminal olmuşsa (InvalidTransition) idempotent yutulur", async () => {
    provider.broadcastTransaction.mockRejectedValue(
      Object.assign(new Error("nonce too low"), { code: "NONCE_EXPIRED" }),
    );
    stateMachine.transitionTo.mockRejectedValue(
      new TransferInvalidTransitionException(),
    );

    await expect(processor.process(job())).resolves.toBeUndefined();
  });

  it("kalıcı hata ham mesajı state event metadata'sına sızmaz", async () => {
    provider.broadcastTransaction.mockRejectedValue(
      Object.assign(new Error("insufficient funds: wallet 0xdeadbeef drained"), {
        code: "INSUFFICIENT_FUNDS",
      }),
    );

    await processor.process(job());

    const call = stateMachine.transitionTo.mock.calls[0];
    expect(JSON.stringify(call[4])).not.toContain("0xdeadbeef");
  });
});
