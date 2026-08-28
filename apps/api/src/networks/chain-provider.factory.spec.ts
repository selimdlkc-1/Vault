import type { ConfigService } from "@nestjs/config";
import { EvmProvider, TronProvider, ChainIdNotAllowedException } from "@vault/chain-providers";
import { ChainProviderFactory } from "./chain-provider.factory";

const ENV: Record<string, string> = {
  CHAIN_ID_ALLOWLIST: "11155111,97,shasta",
  SEPOLIA_RPC_URL: "https://sepolia.example/rpc",
  BSC_TESTNET_RPC_URL: "https://bsc-testnet.example/rpc",
  TRON_SHASTA_RPC_URL: "https://shasta.example",
};

function makeConfig(overrides: Record<string, string> = {}): {
  service: ConfigService;
  getOrThrow: jest.Mock;
} {
  const merged = { ...ENV, ...overrides };
  const getOrThrow = jest.fn((key: string) => {
    if (!(key in merged)) {
      throw new Error(`missing env ${key}`);
    }
    return merged[key];
  });
  return { service: { getOrThrow } as unknown as ConfigService, getOrThrow };
}

describe("ChainProviderFactory", () => {
  it("Sepolia (evm) için EvmProvider döner", () => {
    const factory = new ChainProviderFactory(makeConfig().service);
    const provider = factory.getProvider({ chainType: "evm", chainId: "11155111" });
    expect(provider).toBeInstanceOf(EvmProvider);
    expect(provider.chainType).toBe("evm");
  });

  it("Tron Shasta için TronProvider döner", () => {
    const factory = new ChainProviderFactory(makeConfig().service);
    const provider = factory.getProvider({ chainType: "tron", chainId: "shasta" });
    expect(provider).toBeInstanceOf(TronProvider);
    expect(provider.chainType).toBe("tron");
  });

  it("aynı chain_id için provider'ı önbelleğe alır (RPC env ikinci kez okunmaz)", () => {
    const { service, getOrThrow } = makeConfig();
    const factory = new ChainProviderFactory(service);

    const first = factory.getProvider({ chainType: "evm", chainId: "11155111" });
    const second = factory.getProvider({ chainType: "evm", chainId: "11155111" });

    expect(second).toBe(first);
    expect(getOrThrow.mock.calls.filter(([k]) => k === "SEPOLIA_RPC_URL")).toHaveLength(1);
  });

  it("bilinmeyen chain_id → hata (RPC endpoint eşlemesi yok)", () => {
    const factory = new ChainProviderFactory(makeConfig().service);
    expect(() => factory.getProvider({ chainType: "evm", chainId: "999999" })).toThrow(
      /RPC endpoint eşlemesi yok/,
    );
  });

  // .claude/rules/03-security-baseline.md — allowlist dışı chain_id reddedilir.
  it("allowlist dışı bir chain_id ile provider kurulamaz (ChainIdNotAllowedException)", () => {
    const factory = new ChainProviderFactory(
      makeConfig({ CHAIN_ID_ALLOWLIST: "97,shasta" }).service,
    );
    expect(() => factory.getProvider({ chainType: "evm", chainId: "11155111" })).toThrow(
      ChainIdNotAllowedException,
    );
  });
});
