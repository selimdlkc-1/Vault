import { isValidAddress } from "./address-validator";

/**
 * `docs/08_TESTING_STRATEGY.md` §4 — zorunlu negatif senaryo #12 (geçersiz adres
 * formatı reddi). Kritik modül testi (`.claude/rules/13-critical-modules.md`):
 * EVM EIP-55 checksum ve Tron base58check pozitif + negatif yollar burada
 * sabitlenir; regex tabanlı gevşek bir kontrol kullanılmadığı doğrulanır.
 */
describe("isValidAddress", () => {
  describe("EVM (chainType = 'evm')", () => {
    // vitalik.eth — kanonik EIP-55 checksum'lı adres.
    const CHECKSUMMED = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

    it("checksum'lı geçerli adresi kabul eder", () => {
      expect(isValidAddress("evm", CHECKSUMMED)).toBe(true);
    });

    it("tamamı küçük harf adresi kabul eder (EIP-55: checksum yalnızca karışık harfde zorunlu)", () => {
      expect(isValidAddress("evm", CHECKSUMMED.toLowerCase())).toBe(true);
    });

    it("checksum'ı bozuk (yanlış büyük/küçük harf) adresi reddeder", () => {
      // İlk harf 'd8dA...' → 'd8da...' yapıldı, geri kalan karışık kaldı.
      const badChecksum = "0xd8da6BF26964aF9D7eEd9e03E53415D37aA96045";
      expect(isValidAddress("evm", badChecksum)).toBe(false);
    });

    it("'0x' öneki olmayan 40 hex'i reddeder", () => {
      expect(isValidAddress("evm", "d8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(
        false,
      );
    });

    it("kısa / biçimsiz / boş girdiyi reddeder", () => {
      expect(isValidAddress("evm", "0x1234")).toBe(false);
      expect(isValidAddress("evm", "not-an-address")).toBe(false);
      expect(isValidAddress("evm", "")).toBe(false);
    });

    it("geçerli bir Tron adresini EVM olarak reddeder (ortak regex yok)", () => {
      expect(isValidAddress("evm", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")).toBe(false);
    });
  });

  describe("Tron (chainType = 'tron')", () => {
    // Yaygın olarak yayımlanmış, geçerli base58check Tron adresi (USDT-TRON kontratı).
    const VALID_TRON = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

    it("geçerli base58check adresi kabul eder", () => {
      expect(isValidAddress("tron", VALID_TRON)).toBe(true);
    });

    it("son karakteri bozulmuş (checksum hatası) adresi reddeder", () => {
      expect(isValidAddress("tron", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6X")).toBe(false);
    });

    it("'T' ile başlamayan / biçimsiz / boş girdiyi reddeder", () => {
      expect(isValidAddress("tron", "R7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")).toBe(false);
      expect(isValidAddress("tron", "TFakeAddressNotReallyValid123456789")).toBe(false);
      expect(isValidAddress("tron", "")).toBe(false);
    });

    it("geçerli bir EVM adresini Tron olarak reddeder (ortak regex yok)", () => {
      expect(
        isValidAddress("tron", "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"),
      ).toBe(false);
    });
  });
});
