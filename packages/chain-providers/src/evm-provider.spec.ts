import { Contract, JsonRpcProvider } from "ethers";

import { EvmProvider } from "./evm-provider";
import { ChainIdNotAllowedException } from "./exceptions";

// docs/08_TESTING_STRATEGY.md §5 / .claude/rules/30-testing.md — chain provider
// testleri gerçek RPC'ye karşı çalışmaz. `JsonRpcProvider` ve `Contract` sabit
// mock yanıt döndürecek şekilde değiştirilir; `isAddress` gibi diğer ethers
// yardımcıları (address-validator kullanır) gerçek implementasyonda kalır.
jest.mock("ethers", () => {
  const actual = jest.requireActual<typeof import("ethers")>("ethers");
  return { ...actual, JsonRpcProvider: jest.fn(), Contract: jest.fn() };
});

const jsonRpcProviderMock = JsonRpcProvider as unknown as jest.Mock;
const contractMock = Contract as unknown as jest.Mock;

const ALLOWLIST = ["11155111", "97", "shasta"];

const SEPOLIA = { chainId: "11155111", rpcUrl: "https://sepolia.rpc.invalid" };
const BSC_TESTNET = { chainId: "97", rpcUrl: "https://bsc-testnet.rpc.invalid" };

const HOLDER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const USDT_CONTRACT = "0x1234567890123456789012345678901234567890";

beforeEach(() => {
  jsonRpcProviderMock.mockReset();
  contractMock.mockReset();
});

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
      expect(
        () => new EvmProvider({ chainId: "1", rpcUrl: "https://mainnet.rpc.invalid" }, ALLOWLIST),
      ).toThrow(ChainIdNotAllowedException);
      expect(jsonRpcProviderMock).not.toHaveBeenCalled();
    });

    it("boş allowlist ile fail-fast reddeder", () => {
      expect(() => new EvmProvider(SEPOLIA, [])).toThrow(ChainIdNotAllowedException);
    });
  });

  describe("getBalance (Faz 3 §3.2)", () => {
    it("native varlık (contractAddress null) için eth_getBalance sonucunu string döner", async () => {
      const getBalance = jest.fn().mockResolvedValue(123456789000000000n);
      jsonRpcProviderMock.mockImplementation(() => ({ getBalance }));

      const provider = new EvmProvider(SEPOLIA, ALLOWLIST);
      const result = await provider.getBalance(HOLDER, { contractAddress: null, decimals: 18 });

      expect(result).toBe("123456789000000000");
      expect(typeof result).toBe("string");
      expect(getBalance).toHaveBeenCalledWith(HOLDER);
      expect(contractMock).not.toHaveBeenCalled();
    });

    it("ERC-20 varlık için kontratın balanceOf çağrısını en küçük birimde string döner", async () => {
      jsonRpcProviderMock.mockImplementation(() => ({ getBalance: jest.fn() }));
      const balanceOf = jest.fn().mockResolvedValue(5000000n);
      contractMock.mockImplementation(() => ({ balanceOf }));

      const provider = new EvmProvider(SEPOLIA, ALLOWLIST);
      const result = await provider.getBalance(HOLDER, {
        contractAddress: USDT_CONTRACT,
        decimals: 6,
      });

      expect(result).toBe("5000000");
      expect(contractMock).toHaveBeenCalledWith(USDT_CONTRACT, expect.any(Array), expect.anything());
      expect(balanceOf).toHaveBeenCalledWith(HOLDER);
    });

    it("RPC hatasını yukarı fırlatır (worker retry/backoff'a bırakır)", async () => {
      const getBalance = jest.fn().mockRejectedValue(new Error("RPC 429 rate limited"));
      jsonRpcProviderMock.mockImplementation(() => ({ getBalance }));

      const provider = new EvmProvider(SEPOLIA, ALLOWLIST);
      await expect(
        provider.getBalance(HOLDER, { contractAddress: null, decimals: 18 }),
      ).rejects.toThrow("RPC 429 rate limited");
    });
  });

  // broadcastTransaction'ın davranış testleri `broadcast-transaction.spec.ts`'te
  // (EVM + Tron + classifyRpcError bir arada).
});
