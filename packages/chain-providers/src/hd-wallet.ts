import { Mnemonic } from "ethers";

/**
 * HD wallet türetmesinin ortak yardımcıları (`docs/01_DOMAIN_MODEL.md` §5.1,
 * `docs/mimari-kararlar.md` W-001). Tek bir BIP-39 mnemonic'ten hem EVM
 * (coinType 60) hem Tron (coinType 195) dalları türetilir; türetme secp256k1
 * ile zincir-agnostiktir.
 */

/** EVM ağları (Sepolia, BSC Testnet) — BIP-44 coin type. */
export const EVM_COIN_TYPE = 60;
/** Tron Shasta — BIP-44 coin type. */
export const TRON_COIN_TYPE = 195;

/**
 * BIP-44 türetme yolu: `m/44'/<coinType>'/0'/0/<index>`. `index` tüm ağlar
 * arasında coinType başına tek bir global sayaçtır (`WalletsRepository`
 * `findMaxDerivationIndex`).
 */
export function derivationPath(coinType: number, index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Geçersiz türetme index'i: ${index}`);
  }
  return `m/44'/${coinType}'/0'/0/${index}`;
}

/**
 * `HD_WALLET_MNEMONIC` env doğrulaması için — ethers v6'nın kendi BIP-39
 * doğrulayıcısı (kelime listesi + checksum). Yeni bir `bip39` bağımlılığı
 * eklenmez (`.claude/skills/phase-04.../iterations/02` adım 3).
 */
export function isValidMnemonic(phrase: string): boolean {
  return Mnemonic.isValidMnemonic(phrase);
}
