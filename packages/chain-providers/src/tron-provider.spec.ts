import { TronWeb } from "tronweb";

import { ChainIdNotAllowedException } from "./exceptions";
import { TronProvider } from "./tron-provider";

// docs/08_TESTING_STRATEGY.md §5 — TronGrid'e gerçek istek atılmaz; `TronWeb`
// sabit mock yanıt döndürecek şekilde değiştirilir.
jest.mock("tronweb", () => {
  const actual = jest.requireActual<typeof import("tronweb")>("tronweb");
  return { ...actual, TronWeb: jest.fn() };
});

const tronWebMock = TronWeb as unknown as jest.Mock;

const ALLOWLIST = ["11155111", "97", "shasta"];
const SHASTA = { chainId: "shasta", rpcUrl: "https://api.shasta.trongrid.io" };

const HOLDER = "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE";
const USDT_CONTRACT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";

function mockTronWeb(overrides: {
  getBalance?: jest.Mock;
  call?: jest.Mock;
}): void {
  const call = overrides.call ?? jest.fn().mockResolvedValue("0");
  tronWebMock.mockImplementation(() => ({
    trx: { getBalance: overrides.getBalance ?? jest.fn().mockResolvedValue(0) },
    contract: jest.fn().mockReturnValue({
      balanceOf: jest.fn().mockReturnValue({ call }),
    }),
  }));
}

beforeEach(() => {
  tronWebMock.mockReset();
});

describe("TronProvider", () => {
  describe("constructor + chain ID allowlist", () => {
    it("Tron Shasta için kurulur ve chainType 'tron' olur (pozitif senaryo)", () => {
      mockTronWeb({});
      const provider = new TronProvider(SHASTA, ALLOWLIST);
      expect(provider.chainType).toBe("tron");
    });

    // docs/08_TESTING_STRATEGY.md §4 — zorunlu negatif senaryo #11.
    it("mainnet Tron ('mainnet') / allowlist dışı tanımlayıcıyı reddeder — provider hiç kurulmaz", () => {
      expect(
        () => new TronProvider({ chainId: "mainnet", rpcUrl: "https://api.trongrid.io" }, ALLOWLIST),
      ).toThrow(ChainIdNotAllowedException);
      expect(tronWebMock).not.toHaveBeenCalled();
    });

    it("boş allowlist ile fail-fast reddeder", () => {
      expect(() => new TronProvider(SHASTA, [])).toThrow(ChainIdNotAllowedException);
    });
  });

  describe("getBalance (Faz 3 §3.2)", () => {
    it("native TRX (contractAddress null) için getBalance sonucunu BigInt string döner", async () => {
      const getBalance = jest.fn().mockResolvedValue(987654321);
      mockTronWeb({ getBalance });

      const provider = new TronProvider(SHASTA, ALLOWLIST);
      const result = await provider.getBalance(HOLDER, { contractAddress: null, decimals: 6 });

      expect(result).toBe("987654321");
      expect(typeof result).toBe("string");
      expect(getBalance).toHaveBeenCalledWith(HOLDER);
    });

    it("TRC-20 varlık için kontratın balanceOf().call() sonucunu string döner", async () => {
      const call = jest.fn().mockResolvedValue({ toString: () => "5000000" });
      mockTronWeb({ call });

      const provider = new TronProvider(SHASTA, ALLOWLIST);
      const result = await provider.getBalance(HOLDER, {
        contractAddress: USDT_CONTRACT,
        decimals: 6,
      });

      expect(result).toBe("5000000");
      expect(call).toHaveBeenCalledWith({ from: HOLDER });
    });

    it("TronGrid hatasını yukarı fırlatır (worker retry/backoff'a bırakır)", async () => {
      const getBalance = jest.fn().mockRejectedValue(new Error("TronGrid 503"));
      mockTronWeb({ getBalance });

      const provider = new TronProvider(SHASTA, ALLOWLIST);
      await expect(
        provider.getBalance(HOLDER, { contractAddress: null, decimals: 6 }),
      ).rejects.toThrow("TronGrid 503");
    });
  });

  // broadcastTransaction'ın davranış testleri `broadcast-transaction.spec.ts`'te
  // (EVM + Tron + classifyRpcError bir arada).
});
