import { EvmProvider } from "./evm-provider";
import { derivationPath, isValidMnemonic } from "./hd-wallet";
import { TronProvider } from "./tron-provider";

/**
 * `IChainProvider.deriveWallet` — HD wallet türetme (Faz 4 §4.2,
 * `docs/01_DOMAIN_MODEL.md` §5.1, `docs/mimari-kararlar.md` W-001).
 *
 * Kritik modül (`docs/08_TESTING_STRATEGY.md` §2-3): türetme deterministik
 * olmalı (aynı mnemonic + index → aynı adres) ve EVM/Tron adres formatları
 * ayrışmalı. Bu spec `ethers`/`tronweb`'i **mock'lamaz** — gerçek secp256k1
 * türetmesi test edilir; hiçbir RPC çağrısı yapılmaz (`deriveWallet` senkron).
 */

// BIP-39 geçerli, yaygın bilinen test mnemonic'i (Hardhat varsayılanı) — gerçek
// bir secret değil, yalnızca deterministik türetme vektörü.
const MNEMONIC = "test test test test test test test test test test test junk";

const ALLOWLIST = ["11155111", "97", "shasta"];
const SEPOLIA = { chainId: "11155111", rpcUrl: "https://sepolia.rpc.invalid" };
const BSC_TESTNET = { chainId: "97", rpcUrl: "https://bsc-testnet.rpc.invalid" };
const SHASTA = { chainId: "shasta", rpcUrl: "https://api.shasta.trongrid.io" };

// `m/44'/60'/0'/0/<index>` — Hardhat/anvil ilk hesapları (bilinen vektörler).
const EVM_ADDRESSES = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
];
// `m/44'/195'/0'/0/<index>` — aynı seed, Tron base58check kodlaması.
const TRON_ADDRESSES = [
  "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6",
  "TPjjvMwjPoDC32V2dGDYTkLH4E5LAtBZ6C",
];

describe("hd-wallet yardımcıları", () => {
  it("isValidMnemonic geçerli BIP-39 mnemonic'i kabul eder", () => {
    expect(isValidMnemonic(MNEMONIC)).toBe(true);
  });

  it("isValidMnemonic geçersiz mnemonic'i reddeder", () => {
    expect(isValidMnemonic("kısa mnemonic")).toBe(false);
    expect(isValidMnemonic("test test test test test test test test test test test test")).toBe(
      false,
    );
  });

  it("derivationPath BIP-44 biçimini üretir ve negatif index'i reddeder", () => {
    expect(derivationPath(60, 3)).toBe("m/44'/60'/0'/0/3");
    expect(() => derivationPath(60, -1)).toThrow();
  });
});

describe("EvmProvider.deriveWallet", () => {
  const provider = new EvmProvider(SEPOLIA, ALLOWLIST);

  it("bilinen mnemonic + index için deterministik EIP-55 adresi üretir", () => {
    EVM_ADDRESSES.forEach((address, index) => {
      const derived = provider.deriveWallet(MNEMONIC, index);
      expect(derived.address).toBe(address);
      expect(derived.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
    });
  });

  it("aynı mnemonic + index tekrar çağrıda birebir aynı sonucu verir", () => {
    expect(provider.deriveWallet(MNEMONIC, 0)).toEqual(provider.deriveWallet(MNEMONIC, 0));
  });

  it("farklı index farklı adres üretir", () => {
    expect(provider.deriveWallet(MNEMONIC, 0).address).not.toBe(
      provider.deriveWallet(MNEMONIC, 1).address,
    );
  });

  it("Sepolia ve BSC Testnet aynı coinType 60'ı paylaşır — aynı adres", () => {
    const bsc = new EvmProvider(BSC_TESTNET, ALLOWLIST);
    expect(bsc.deriveWallet(MNEMONIC, 0).address).toBe(
      provider.deriveWallet(MNEMONIC, 0).address,
    );
  });
});

describe("TronProvider.deriveWallet", () => {
  const provider = new TronProvider(SHASTA, ALLOWLIST);

  it("bilinen mnemonic + index için deterministik base58check adresi üretir", () => {
    TRON_ADDRESSES.forEach((address, index) => {
      const derived = provider.deriveWallet(MNEMONIC, index);
      expect(derived.address).toBe(address);
      expect(derived.address).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
      // tronweb kanonik biçimi: 0x öneksiz hex.
      expect(derived.privateKey).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  it("farklı index farklı adres üretir", () => {
    expect(provider.deriveWallet(MNEMONIC, 0).address).not.toBe(
      provider.deriveWallet(MNEMONIC, 1).address,
    );
  });
});

describe("EVM ve Tron adres formatı ayrışır", () => {
  it("aynı mnemonic + index → farklı format, farklı adres", () => {
    const evm = new EvmProvider(SEPOLIA, ALLOWLIST).deriveWallet(MNEMONIC, 0);
    const tron = new TronProvider(SHASTA, ALLOWLIST).deriveWallet(MNEMONIC, 0);

    expect(evm.address.startsWith("0x")).toBe(true);
    expect(tron.address.startsWith("T")).toBe(true);
    expect(evm.address).not.toBe(tron.address);
  });
});
