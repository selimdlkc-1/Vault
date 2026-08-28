import { assertChainIdAllowed } from "./chain-id-allowlist";
import { ChainIdNotAllowedException } from "./exceptions";

// Test edilen chain_id string'leri, İterasyon 1'de sabitlenen seed verisiyle
// (apps/api/prisma/seed.ts) BİREBİR aynıdır — Sepolia "11155111", BSC Testnet
// "97", Tron Shasta "shasta". Bir sapma olursa allowlist kontrolü hiçbir zaman
// geçmez (bkz. §2.5 Risk / dikkat).
const SEED_CHAIN_IDS = ["11155111", "97", "shasta"];

describe("assertChainIdAllowed", () => {
  it("seed'deki üç geçerli chain_id için sessizce geçer (pozitif senaryo)", () => {
    for (const chainId of SEED_CHAIN_IDS) {
      expect(() => assertChainIdAllowed(chainId, SEED_CHAIN_IDS)).not.toThrow();
    }
  });

  it("mainnet chain ID'sini reddeder (Ethereum mainnet '1')", () => {
    expect(() => assertChainIdAllowed("1", SEED_CHAIN_IDS)).toThrow(ChainIdNotAllowedException);
  });

  it("allowlist dışı başka bir chain ID'yi reddeder (BSC mainnet '56')", () => {
    expect(() => assertChainIdAllowed("56", SEED_CHAIN_IDS)).toThrow(ChainIdNotAllowedException);
  });

  it("boş allowlist ile fail-fast reddeder — hiçbir ağ varsayılan olarak izinli değildir", () => {
    expect(() => assertChainIdAllowed("11155111", [])).toThrow(ChainIdNotAllowedException);
  });

  it("geçersiz (array olmayan) allowlist ile fail-fast reddeder", () => {
    expect(() =>
      assertChainIdAllowed("11155111", undefined as unknown as string[]),
    ).toThrow(ChainIdNotAllowedException);
  });

  it("exception mesajı çözülemeyen chain ID'yi taşır ama allowlist genişletme ipucu vermez", () => {
    try {
      assertChainIdAllowed("1", SEED_CHAIN_IDS);
      fail("beklenen exception fırlatılmadı");
    } catch (error) {
      expect(error).toBeInstanceOf(ChainIdNotAllowedException);
      expect((error as ChainIdNotAllowedException).chainId).toBe("1");
    }
  });
});
