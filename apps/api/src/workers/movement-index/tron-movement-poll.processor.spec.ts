import type { Job, Queue } from "bullmq";
import type { ActiveWalletAssetPair } from "../../wallets/wallets.repository";
import type { WalletsService } from "../../wallets/wallets.service";
import type { MovementsService } from "../../movements/movements.service";
import type {
  Trc20Transfer,
  TrongridMovementClient,
} from "./trongrid-movement-client";
import {
  MOVEMENT_INDEX_QUEUE,
  POLL_ALL_JOB,
  POLL_ONE_JOB,
  TronMovementPollProcessor,
} from "./tron-movement-poll.processor";

const TRON_ADDR = "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE";
const OTHER_ADDR = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

const TRON_USDT_PAIR: ActiveWalletAssetPair = {
  walletId: "w-tron",
  address: TRON_ADDR,
  chainType: "tron",
  chainId: "shasta",
  assetId: "a-usdt",
  assetContractAddress: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
  assetDecimals: 6,
};

const TRON_NATIVE_PAIR: ActiveWalletAssetPair = {
  ...TRON_USDT_PAIR,
  assetId: "a-trx",
  assetContractAddress: null,
};

const EVM_PAIR: ActiveWalletAssetPair = {
  walletId: "w-evm",
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  chainType: "evm",
  chainId: "11155111",
  assetId: "a-eth",
  assetContractAddress: null,
  assetDecimals: 18,
};

function job(name: string, data: unknown = {}): Job {
  return { name, data } as unknown as Job;
}

function transfer(overrides: Partial<Trc20Transfer> = {}): Trc20Transfer {
  return {
    txHash: "tron-tx-1",
    fromAddress: OTHER_ADDR,
    toAddress: TRON_ADDR,
    value: "5000000",
    occurredAt: new Date("2026-08-20T00:00:00.000Z"),
    ...overrides,
  };
}

describe("TronMovementPollProcessor", () => {
  let queue: jest.Mocked<Pick<Queue, "add">>;
  let wallets: jest.Mocked<Pick<WalletsService, "listActiveWalletAssetPairs">>;
  let movements: jest.Mocked<Pick<MovementsService, "indexChainMovement">>;
  let trongrid: jest.Mocked<Pick<TrongridMovementClient, "fetchTrc20Transfers">>;
  let processor: TronMovementPollProcessor;

  beforeEach(() => {
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    wallets = { listActiveWalletAssetPairs: jest.fn().mockResolvedValue([]) };
    movements = { indexChainMovement: jest.fn().mockResolvedValue(true) };
    trongrid = { fetchTrc20Transfers: jest.fn().mockResolvedValue([]) };
    processor = new TronMovementPollProcessor(
      queue as unknown as Queue,
      wallets as unknown as WalletsService,
      movements as unknown as MovementsService,
      trongrid as unknown as TrongridMovementClient,
    );
  });

  describe("onModuleInit", () => {
    it("sabit job id + 60 sn aralıkla repeatable poll-all kaydeder", async () => {
      await processor.onModuleInit();
      const [name, data, opts] = queue.add.mock.calls[0];
      expect(name).toBe(POLL_ALL_JOB);
      expect(data).toEqual({});
      expect(opts).toMatchObject({
        repeat: { every: 60_000 },
        jobId: "movement-index-tron-scheduler",
      });
    });
  });

  describe("process — poll-all (fan-out)", () => {
    it("yalnızca Tron + TRC-20 (kontrat adresli) çiftleri kuyruğa alınır", async () => {
      wallets.listActiveWalletAssetPairs.mockResolvedValue([
        EVM_PAIR,
        TRON_NATIVE_PAIR,
        TRON_USDT_PAIR,
      ]);

      await processor.process(job(POLL_ALL_JOB));

      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.add).toHaveBeenCalledWith(
        POLL_ONE_JOB,
        TRON_USDT_PAIR,
        expect.objectContaining({
          jobId: `${MOVEMENT_INDEX_QUEUE}:w-tron:a-usdt`,
          attempts: 5,
        }),
      );
    });

    it("uygun çift yoksa hiçbir job eklemez", async () => {
      wallets.listActiveWalletAssetPairs.mockResolvedValue([EVM_PAIR]);
      await processor.process(job(POLL_ALL_JOB));
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe("process — poll-one", () => {
    it("gelen transfer (to == cüzdan) → incoming olarak indexlenir", async () => {
      trongrid.fetchTrc20Transfers.mockResolvedValue([transfer()]);

      await processor.process(job(POLL_ONE_JOB, TRON_USDT_PAIR));

      expect(trongrid.fetchTrc20Transfers).toHaveBeenCalledWith(
        TRON_ADDR,
        TRON_USDT_PAIR.assetContractAddress,
      );
      expect(movements.indexChainMovement).toHaveBeenCalledWith({
        walletId: "w-tron",
        assetId: "a-usdt",
        txHash: "tron-tx-1",
        direction: "incoming",
        amount: "5000000",
        occurredAt: new Date("2026-08-20T00:00:00.000Z"),
      });
    });

    it("giden transfer (from == cüzdan) → outgoing", async () => {
      trongrid.fetchTrc20Transfers.mockResolvedValue([
        transfer({ txHash: "tx-out", fromAddress: TRON_ADDR, toAddress: OTHER_ADDR }),
      ]);

      await processor.process(job(POLL_ONE_JOB, TRON_USDT_PAIR));

      expect(movements.indexChainMovement).toHaveBeenCalledWith(
        expect.objectContaining({ txHash: "tx-out", direction: "outgoing" }),
      );
    });

    it("cüzdanla ilgisiz transfer atlanır", async () => {
      trongrid.fetchTrc20Transfers.mockResolvedValue([
        transfer({ fromAddress: OTHER_ADDR, toAddress: OTHER_ADDR }),
      ]);
      await processor.process(job(POLL_ONE_JOB, TRON_USDT_PAIR));
      expect(movements.indexChainMovement).not.toHaveBeenCalled();
    });

    it("tekilleştirme: aynı tx iki turda da gelse ikinci turda yazım atlanır (idempotent)", async () => {
      trongrid.fetchTrc20Transfers.mockResolvedValue([transfer()]);
      movements.indexChainMovement
        .mockResolvedValueOnce(true) // ilk tur: yeni satır
        .mockResolvedValueOnce(false); // ikinci tur: zaten var

      await processor.process(job(POLL_ONE_JOB, TRON_USDT_PAIR));
      await processor.process(job(POLL_ONE_JOB, TRON_USDT_PAIR));

      expect(movements.indexChainMovement).toHaveBeenCalledTimes(2);
      expect(movements.indexChainMovement).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ txHash: "tron-tx-1", direction: "incoming" }),
      );
    });

    it("TronGrid hatası job'u düşürür (yakalanmaz)", async () => {
      trongrid.fetchTrc20Transfers.mockRejectedValue(new Error("TronGrid 429"));
      await expect(
        processor.process(job(POLL_ONE_JOB, TRON_USDT_PAIR)),
      ).rejects.toThrow("TronGrid 429");
      expect(movements.indexChainMovement).not.toHaveBeenCalled();
    });
  });

  it("bilinmeyen job adında sessizce çıkar", async () => {
    await expect(processor.process(job("garip"))).resolves.toBeUndefined();
    expect(queue.add).not.toHaveBeenCalled();
    expect(movements.indexChainMovement).not.toHaveBeenCalled();
  });
});
