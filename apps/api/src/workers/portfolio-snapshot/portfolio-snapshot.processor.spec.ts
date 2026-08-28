import type { Job, Queue } from "bullmq";
import type {
  PortfolioService,
  PortfolioSummaryView,
} from "../../portfolio/portfolio.service";
import {
  PortfolioSnapshotProcessor,
  SNAPSHOT_ALL_JOB,
} from "./portfolio-snapshot.processor";

function job(name: string, data: unknown = {}): Job {
  return { name, data } as unknown as Job;
}

function summary(total: string): PortfolioSummaryView {
  return { totalValueUsdt: total, wallets: [] };
}

describe("PortfolioSnapshotProcessor", () => {
  let queue: jest.Mocked<Pick<Queue, "add">>;
  let portfolio: jest.Mocked<
    Pick<PortfolioService, "listUserIdsWithWallets" | "getSummary" | "saveSnapshot">
  >;
  let processor: PortfolioSnapshotProcessor;

  beforeEach(() => {
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    portfolio = {
      listUserIdsWithWallets: jest.fn().mockResolvedValue([]),
      getSummary: jest.fn().mockResolvedValue(summary("0.000000000000000000")),
      saveSnapshot: jest.fn().mockResolvedValue(undefined),
    };
    processor = new PortfolioSnapshotProcessor(
      queue as unknown as Queue,
      portfolio as unknown as PortfolioService,
    );
  });

  describe("onModuleInit", () => {
    it("5 dk'lık repeatable snapshot-all job'unu sabit job id ile kaydeder", async () => {
      await processor.onModuleInit();

      expect(queue.add).toHaveBeenCalledTimes(1);
      const [name, data, opts] = queue.add.mock.calls[0];
      expect(name).toBe(SNAPSHOT_ALL_JOB);
      expect(data).toEqual({});
      expect(opts).toMatchObject({
        repeat: { every: 300_000 },
        jobId: "portfolio-snapshot-scheduler",
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
      });
    });
  });

  describe("process — snapshot-all", () => {
    it("her kullanıcı için getSummary sonucunu portfolio_snapshots'a yazar (priceSource coingecko)", async () => {
      portfolio.listUserIdsWithWallets.mockResolvedValue(["u1", "u2"]);
      portfolio.getSummary.mockImplementation((userId: string) =>
        Promise.resolve(
          summary(
            userId === "u1"
              ? "2600.000000000000000000"
              : "10.500000000000000000",
          ),
        ),
      );

      await processor.process(job(SNAPSHOT_ALL_JOB));

      expect(portfolio.saveSnapshot).toHaveBeenNthCalledWith(1, {
        userId: "u1",
        totalValueUsdt: "2600.000000000000000000",
        priceSource: "coingecko",
      });
      expect(portfolio.saveSnapshot).toHaveBeenNthCalledWith(2, {
        userId: "u2",
        totalValueUsdt: "10.500000000000000000",
        priceSource: "coingecko",
      });
    });

    it("bir kullanıcının özeti hata verirse onu atlar, diğerlerini yazar (job fırlatmaz)", async () => {
      portfolio.listUserIdsWithWallets.mockResolvedValue(["u1", "u2"]);
      portfolio.getSummary.mockImplementation((userId: string) =>
        userId === "u1"
          ? Promise.reject(new Error("boom"))
          : Promise.resolve(summary("5.000000000000000000")),
      );

      await expect(
        processor.process(job(SNAPSHOT_ALL_JOB)),
      ).resolves.toBeUndefined();

      expect(portfolio.saveSnapshot).toHaveBeenCalledTimes(1);
      expect(portfolio.saveSnapshot).toHaveBeenCalledWith({
        userId: "u2",
        totalValueUsdt: "5.000000000000000000",
        priceSource: "coingecko",
      });
    });

    it("cüzdanı olan kullanıcı yoksa hiçbir snapshot yazılmaz", async () => {
      await processor.process(job(SNAPSHOT_ALL_JOB));
      expect(portfolio.saveSnapshot).not.toHaveBeenCalled();
    });
  });

  describe("process — bilinmeyen job", () => {
    it("bilinmeyen job adında sessizce çıkar", async () => {
      await expect(processor.process(job("garip-job"))).resolves.toBeUndefined();
      expect(portfolio.listUserIdsWithWallets).not.toHaveBeenCalled();
      expect(portfolio.saveSnapshot).not.toHaveBeenCalled();
    });
  });
});
