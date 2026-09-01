import type { TransactionReceipt } from "@vault/chain-providers";
import type { Job } from "bullmq";
import { TransferInvalidTransitionException } from "../../common/exceptions/domain.exception";
import type { ChainProviderFactory } from "../../networks/chain-provider.factory";
import type { PrismaService } from "../../prisma/prisma.service";
import type { TransferStateMachine } from "../../transfers/transfer-state-machine.service";
import type {
  ConfirmationContext,
  TransfersService,
} from "../../transfers/transfers.service";
import { ConfirmationProcessor } from "./confirmation.processor";
import {
  confirmationJobId,
  type ConfirmationJobData,
  POLL_ALL_JOB,
  POLL_ONE_JOB,
} from "./confirmation.queue";

const TRANSFER_ID = "77777777-7777-4777-8777-777777777777";
const TX_HASH = `0x${"ab".repeat(32)}`;
const BLOCK_HASH_A = `0x${"a1".repeat(32)}`;
const BLOCK_HASH_B = `0x${"b2".repeat(32)}`;
const TX = { __tx: true };

// Sepolia — chain_id "11155111", onay eşiği 12, mempool drop eşiği 30 dk.
function context(overrides: Partial<ConfirmationContext> = {}): ConfirmationContext {
  return {
    transferId: TRANSFER_ID,
    state: "confirming",
    txHash: TX_HASH,
    chain: { chainType: "evm", chainId: "11155111" },
    updatedAt: new Date(Date.now() - 60_000),
    confirmingBlockHash: BLOCK_HASH_A,
    ...overrides,
  };
}

function receipt(overrides: Partial<TransactionReceipt> = {}): TransactionReceipt {
  return {
    status: "success",
    blockNumber: 1000,
    blockHash: BLOCK_HASH_A,
    currentBlockHeight: 1005,
    ...overrides,
  };
}

function pollOneJob(): Job {
  return {
    name: POLL_ONE_JOB,
    data: { transferId: TRANSFER_ID } satisfies ConfirmationJobData,
  } as unknown as Job;
}

describe("ConfirmationProcessor", () => {
  let queue: { add: jest.Mock };
  let transfers: jest.Mocked<
    Pick<TransfersService, "getConfirmationContext" | "listInFlightTransferIds">
  >;
  let stateMachine: jest.Mocked<Pick<TransferStateMachine, "transitionTo">>;
  let providers: jest.Mocked<Pick<ChainProviderFactory, "getProvider">>;
  let provider: { getTransactionReceipt: jest.Mock };
  let prisma: { $transaction: jest.Mock };
  let processor: ConfirmationProcessor;

  beforeEach(() => {
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    provider = {
      getTransactionReceipt: jest.fn().mockResolvedValue(receipt()),
    };
    providers = { getProvider: jest.fn().mockReturnValue(provider) };
    transfers = {
      getConfirmationContext: jest.fn().mockResolvedValue(context()),
      listInFlightTransferIds: jest.fn().mockResolvedValue([TRANSFER_ID]),
    };
    stateMachine = { transitionTo: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(TX)),
    };
    processor = new ConfirmationProcessor(
      queue as unknown as import("bullmq").Queue,
      transfers as unknown as TransfersService,
      stateMachine as unknown as TransferStateMachine,
      providers as unknown as ChainProviderFactory,
      prisma as unknown as PrismaService,
    );
  });

  describe("fan-out (poll-all)", () => {
    it("in-flight transfer'lerin her biri için poll-one job'u kuyruğa alır (dedup jobId ile)", async () => {
      transfers.listInFlightTransferIds.mockResolvedValue(["t1", "t2"]);

      await processor.process({ name: POLL_ALL_JOB, data: {} } as unknown as Job);

      expect(queue.add).toHaveBeenCalledTimes(2);
      expect(queue.add).toHaveBeenCalledWith(
        POLL_ONE_JOB,
        { transferId: "t1" },
        expect.objectContaining({ jobId: confirmationJobId("t1") }),
      );
    });
  });

  it("bilinmeyen job adı: sessizce çıkar", async () => {
    await processor.process({ name: "garip", data: {} } as unknown as Job);
    expect(transfers.getConfirmationContext).not.toHaveBeenCalled();
  });

  describe("poll-one — durum geçişleri", () => {
    it("ilk bloğa giriş (broadcast durumu): broadcast → confirming, blok hash metadata'ya yazılır", async () => {
      transfers.getConfirmationContext.mockResolvedValue(
        context({ state: "broadcast", confirmingBlockHash: null }),
      );
      provider.getTransactionReceipt.mockResolvedValue(
        receipt({ blockNumber: 1000, blockHash: BLOCK_HASH_A, currentBlockHeight: 1000 }),
      );

      await processor.process(pollOneJob());

      expect(stateMachine.transitionTo).toHaveBeenCalledWith(
        TX,
        TRANSFER_ID,
        "confirming",
        "worker:confirmation",
        expect.objectContaining({
          metadata: expect.objectContaining({ blockHash: BLOCK_HASH_A, blockNumber: 1000 }),
        }),
      );
    });

    it("eşik aşımı (confirming, depth >= 12): confirming → confirmed", async () => {
      provider.getTransactionReceipt.mockResolvedValue(
        receipt({ blockNumber: 1000, blockHash: BLOCK_HASH_A, currentBlockHeight: 1012 }),
      );

      await processor.process(pollOneJob());

      expect(stateMachine.transitionTo).toHaveBeenCalledWith(
        TX,
        TRANSFER_ID,
        "confirmed",
        "worker:confirmation",
        expect.objectContaining({ metadata: expect.objectContaining({ depth: 12 }) }),
      );
    });

    it("eşik altı derinlik (depth 5 < 12): geçiş yapılmaz", async () => {
      provider.getTransactionReceipt.mockResolvedValue(
        receipt({ blockNumber: 1000, blockHash: BLOCK_HASH_A, currentBlockHeight: 1005 }),
      );

      await processor.process(pollOneJob());

      expect(stateMachine.transitionTo).not.toHaveBeenCalled();
    });

    it("revert (status 'reverted'): → failed, sadeleştirilmiş failureReason", async () => {
      provider.getTransactionReceipt.mockResolvedValue(
        receipt({ status: "reverted" }),
      );

      await processor.process(pollOneJob());

      expect(stateMachine.transitionTo).toHaveBeenCalledWith(
        TX,
        TRANSFER_ID,
        "failed",
        "worker:confirmation",
        expect.objectContaining({
          failureReason: "İşlem zincir tarafından reddedildi.",
        }),
      );
    });

    it("zaman aşımı (pending + updatedAt eşiği aştı): → dropped, failureReason yok", async () => {
      transfers.getConfirmationContext.mockResolvedValue(
        context({
          state: "broadcast",
          confirmingBlockHash: null,
          updatedAt: new Date(Date.now() - 31 * 60_000),
        }),
      );
      provider.getTransactionReceipt.mockResolvedValue(
        receipt({ status: "pending", blockNumber: null, blockHash: null }),
      );

      await processor.process(pollOneJob());

      expect(stateMachine.transitionTo).toHaveBeenCalledWith(
        TX,
        TRANSFER_ID,
        "dropped",
        "worker:confirmation",
        expect.not.objectContaining({ failureReason: expect.anything() }),
      );
    });

    it("pending ama zaman aşımı içinde: hiçbir geçiş yapılmaz", async () => {
      transfers.getConfirmationContext.mockResolvedValue(
        context({ updatedAt: new Date(Date.now() - 60_000) }),
      );
      provider.getTransactionReceipt.mockResolvedValue(
        receipt({ status: "pending", blockNumber: null, blockHash: null }),
      );

      await processor.process(pollOneJob());

      expect(stateMachine.transitionTo).not.toHaveBeenCalled();
    });
  });

  describe("reorg toleransı (I-007)", () => {
    it("block hash mismatch (confirming): eşik aşılmış görünse bile confirmed'e GEÇİLMEZ, confirming'de kalır", async () => {
      transfers.getConfirmationContext.mockResolvedValue(
        context({ state: "confirming", confirmingBlockHash: BLOCK_HASH_A }),
      );
      // Yeni blok hash + fazlasıyla yeterli derinlik — reorg olmasaydı confirmed olurdu.
      provider.getTransactionReceipt.mockResolvedValue(
        receipt({ blockNumber: 1001, blockHash: BLOCK_HASH_B, currentBlockHeight: 1100 }),
      );

      await processor.process(pollOneJob());

      expect(stateMachine.transitionTo).not.toHaveBeenCalled();
    });

    it("reorg turundan sonra: blok hash artık tutarlı → bir sonraki tur confirmed olur (sayaç sıfırlanmadı)", async () => {
      transfers.getConfirmationContext.mockResolvedValue(
        context({ state: "confirming", confirmingBlockHash: BLOCK_HASH_A }),
      );
      // 1. tur: reorg (A → B).
      provider.getTransactionReceipt.mockResolvedValueOnce(
        receipt({ blockNumber: 1001, blockHash: BLOCK_HASH_B, currentBlockHeight: 1100 }),
      );
      // 2. tur: aynı yeni blok hash (B), yeterli derinlik.
      provider.getTransactionReceipt.mockResolvedValueOnce(
        receipt({ blockNumber: 1001, blockHash: BLOCK_HASH_B, currentBlockHeight: 1101 }),
      );

      await processor.process(pollOneJob());
      await processor.process(pollOneJob());

      expect(stateMachine.transitionTo).toHaveBeenCalledTimes(1);
      expect(stateMachine.transitionTo).toHaveBeenCalledWith(
        TX,
        TRANSFER_ID,
        "confirmed",
        "worker:confirmation",
        expect.anything(),
      );
    });
  });

  describe("idempotency / hata dayanıklılığı", () => {
    it("terminal / yok (getConfirmationContext null): provider hiç çağrılmaz, geçiş yapılmaz", async () => {
      transfers.getConfirmationContext.mockResolvedValue(null);

      await processor.process(pollOneJob());

      expect(providers.getProvider).not.toHaveBeenCalled();
      expect(stateMachine.transitionTo).not.toHaveBeenCalled();
    });

    it("getTransactionReceipt RPC hatası: yutulur, geçiş yapılmaz (sonraki tur yeniden dener)", async () => {
      provider.getTransactionReceipt.mockRejectedValue(new Error("RPC 503"));

      await expect(processor.process(pollOneJob())).resolves.toBeUndefined();
      expect(stateMachine.transitionTo).not.toHaveBeenCalled();
    });

    it("geçiş sırasında transfer eşzamanlı terminal olduysa (InvalidTransition): idempotent yutulur", async () => {
      provider.getTransactionReceipt.mockResolvedValue(
        receipt({ blockNumber: 1000, blockHash: BLOCK_HASH_A, currentBlockHeight: 1012 }),
      );
      stateMachine.transitionTo.mockRejectedValue(
        new TransferInvalidTransitionException(),
      );

      await expect(processor.process(pollOneJob())).resolves.toBeUndefined();
    });
  });
});
