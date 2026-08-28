import type { Job, Queue } from "bullmq";
import type { IChainProvider } from "@vault/chain-providers";
import type { ChainProviderFactory } from "../../networks/chain-provider.factory";
import type { ActiveWalletAssetPair } from "../../wallets/wallets.repository";
import type { WalletsService } from "../../wallets/wallets.service";
import {
  BALANCE_SYNC_QUEUE,
  BalanceSyncProcessor,
  SYNC_ALL_JOB,
  SYNC_ONE_JOB,
} from "./balance-sync.processor";

const EVM_PAIR: ActiveWalletAssetPair = {
  walletId: "w-evm",
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  chainType: "evm",
  chainId: "11155111",
  assetId: "a-eth",
  assetContractAddress: null,
  assetDecimals: 18,
};

const TRON_PAIR: ActiveWalletAssetPair = {
  walletId: "w-tron",
  address: "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
  chainType: "tron",
  chainId: "shasta",
  assetId: "a-usdt",
  assetContractAddress: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
  assetDecimals: 6,
};

function job(name: string, data: unknown = {}): Job {
  return { name, data } as unknown as Job;
}

describe("BalanceSyncProcessor", () => {
  let queue: jest.Mocked<Pick<Queue, "add">>;
  let wallets: jest.Mocked<
    Pick<WalletsService, "listActiveWalletAssetPairs" | "saveCachedBalance">
  >;
  let providers: jest.Mocked<Pick<ChainProviderFactory, "getProvider">>;
  let provider: jest.Mocked<Pick<IChainProvider, "getBalance">>;
  let processor: BalanceSyncProcessor;

  beforeEach(() => {
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    wallets = {
      listActiveWalletAssetPairs: jest.fn().mockResolvedValue([]),
      saveCachedBalance: jest.fn().mockResolvedValue(undefined),
    };
    provider = { getBalance: jest.fn().mockResolvedValue("0") };
    providers = { getProvider: jest.fn().mockReturnValue(provider) };
    processor = new BalanceSyncProcessor(
      queue as unknown as Queue,
      wallets as unknown as WalletsService,
      providers as unknown as ChainProviderFactory,
    );
  });

  describe("onModuleInit", () => {
    it("periyodik (repeatable) sync-all job'unu sabit bir job id ile kaydeder", async () => {
      await processor.onModuleInit();

      expect(queue.add).toHaveBeenCalledTimes(1);
      const [name, data, opts] = queue.add.mock.calls[0];
      expect(name).toBe(SYNC_ALL_JOB);
      expect(data).toEqual({});
      expect(opts).toMatchObject({
        repeat: { every: 60_000 },
        jobId: "balance-sync-scheduler",
      });
    });
  });

  describe("process — sync-all (fan-out)", () => {
    it("her aktif çift için (walletId, assetId)'den türetilmiş job id ile sync-one job'u ekler", async () => {
      wallets.listActiveWalletAssetPairs.mockResolvedValue([EVM_PAIR, TRON_PAIR]);

      await processor.process(job(SYNC_ALL_JOB));

      expect(queue.add).toHaveBeenCalledTimes(2);
      expect(queue.add).toHaveBeenNthCalledWith(
        1,
        SYNC_ONE_JOB,
        EVM_PAIR,
        expect.objectContaining({
          jobId: `${BALANCE_SYNC_QUEUE}:w-evm:a-eth`,
          attempts: 5,
          backoff: { type: "exponential", delay: 1000 },
        }),
      );
      expect(queue.add).toHaveBeenNthCalledWith(
        2,
        SYNC_ONE_JOB,
        TRON_PAIR,
        expect.objectContaining({ jobId: `${BALANCE_SYNC_QUEUE}:w-tron:a-usdt` }),
      );
    });

    it("aktif çift yoksa hiçbir job eklemez", async () => {
      await processor.process(job(SYNC_ALL_JOB));
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe("process — sync-one", () => {
    it("native varlık: doğru provider'ı seçip getBalance sonucunu balance_caches'e yazar", async () => {
      provider.getBalance.mockResolvedValue("123456789000000000");

      await processor.process(job(SYNC_ONE_JOB, EVM_PAIR));

      expect(providers.getProvider).toHaveBeenCalledWith({
        chainType: "evm",
        chainId: "11155111",
      });
      expect(provider.getBalance).toHaveBeenCalledWith(EVM_PAIR.address, {
        contractAddress: null,
        decimals: 18,
      });
      expect(wallets.saveCachedBalance).toHaveBeenCalledWith({
        walletId: "w-evm",
        assetId: "a-eth",
        balanceRaw: "123456789000000000",
      });
    });

    it("kontrat varlığı: contractAddress'i getBalance'a iletir", async () => {
      provider.getBalance.mockResolvedValue("5000000");

      await processor.process(job(SYNC_ONE_JOB, TRON_PAIR));

      expect(provider.getBalance).toHaveBeenCalledWith(TRON_PAIR.address, {
        contractAddress: TRON_PAIR.assetContractAddress,
        decimals: 6,
      });
      expect(wallets.saveCachedBalance).toHaveBeenCalledWith({
        walletId: "w-tron",
        assetId: "a-usdt",
        balanceRaw: "5000000",
      });
    });

    it("RPC hatası job'u düşürür — exception yakalanmaz, balance_caches yazılmaz", async () => {
      provider.getBalance.mockRejectedValue(new Error("RPC 429 rate limited"));

      await expect(processor.process(job(SYNC_ONE_JOB, EVM_PAIR))).rejects.toThrow(
        "RPC 429 rate limited",
      );
      expect(wallets.saveCachedBalance).not.toHaveBeenCalled();
    });
  });

  describe("process — bilinmeyen job", () => {
    it("bilinmeyen job adında sessizce çıkar (fırlatmaz, iş yapmaz)", async () => {
      await expect(processor.process(job("garip-job"))).resolves.toBeUndefined();
      expect(queue.add).not.toHaveBeenCalled();
      expect(wallets.saveCachedBalance).not.toHaveBeenCalled();
    });
  });
});
