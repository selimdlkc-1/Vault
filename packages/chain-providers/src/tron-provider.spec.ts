import { ChainIdNotAllowedException, NotImplementedException } from "./exceptions";
import { TronProvider } from "./tron-provider";

const ALLOWLIST = ["11155111", "97", "shasta"];

const SHASTA = { chainId: "shasta", rpcUrl: "https://api.shasta.trongrid.io" };

describe("TronProvider", () => {
  describe("constructor + chain ID allowlist", () => {
    it("Tron Shasta için kurulur ve chainType 'tron' olur (pozitif senaryo)", () => {
      const provider = new TronProvider(SHASTA, ALLOWLIST);
      expect(provider.chainType).toBe("tron");
    });

    // docs/08_TESTING_STRATEGY.md §4 — zorunlu negatif senaryo #11.
    it("mainnet Tron ('mainnet') / allowlist dışı tanımlayıcıyı reddeder — provider hiç kurulmaz", () => {
      expect(() => new TronProvider({ chainId: "mainnet", rpcUrl: "https://api.trongrid.io" }, ALLOWLIST)).toThrow(
        ChainIdNotAllowedException,
      );
    });

    it("boş allowlist ile fail-fast reddeder", () => {
      expect(() => new TronProvider(SHASTA, [])).toThrow(ChainIdNotAllowedException);
    });
  });

  describe("stub metotlar (Faz 3 §3.2 / Faz 5 dolduracak)", () => {
    const provider = new TronProvider(SHASTA, ALLOWLIST);

    it("getBalance NotImplementedException fırlatır", () => {
      expect(() => provider.getBalance()).toThrow(NotImplementedException);
    });

    it("broadcastTransaction NotImplementedException fırlatır", () => {
      expect(() => provider.broadcastTransaction()).toThrow(NotImplementedException);
    });
  });
});
