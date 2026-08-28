import { EvmProvider } from "./evm-provider";
import { ChainIdNotAllowedException, NotImplementedException } from "./exceptions";

const ALLOWLIST = ["11155111", "97", "shasta"];

const SEPOLIA = { chainId: "11155111", rpcUrl: "https://sepolia.rpc.invalid" };
const BSC_TESTNET = { chainId: "97", rpcUrl: "https://bsc-testnet.rpc.invalid" };

describe("EvmProvider", () => {
  describe("constructor + chain ID allowlist", () => {
    it("Sepolia için kurulur ve chainType 'evm' olur (pozitif senaryo)", () => {
      const provider = new EvmProvider(SEPOLIA, ALLOWLIST);
      expect(provider.chainType).toBe("evm");
    });

    it("BSC Testnet için aynı EvmProvider koduyla kurulur (pozitif senaryo)", () => {
      const provider = new EvmProvider(BSC_TESTNET, ALLOWLIST);
      expect(provider.chainType).toBe("evm");
    });

    // docs/08_TESTING_STRATEGY.md §4 — zorunlu negatif senaryo #11.
    it("mainnet chain ID ('1') ile başlatma denemesini reddeder — provider hiç kurulmaz", () => {
      expect(() => new EvmProvider({ chainId: "1", rpcUrl: "https://mainnet.rpc.invalid" }, ALLOWLIST)).toThrow(
        ChainIdNotAllowedException,
      );
    });

    it("boş allowlist ile fail-fast reddeder", () => {
      expect(() => new EvmProvider(SEPOLIA, [])).toThrow(ChainIdNotAllowedException);
    });
  });

  describe("stub metotlar (Faz 3 §3.2 / Faz 5 dolduracak)", () => {
    const provider = new EvmProvider(SEPOLIA, ALLOWLIST);

    it("getBalance NotImplementedException fırlatır", () => {
      expect(() => provider.getBalance()).toThrow(NotImplementedException);
    });

    it("broadcastTransaction NotImplementedException fırlatır", () => {
      expect(() => provider.broadcastTransaction()).toThrow(NotImplementedException);
    });
  });
});
