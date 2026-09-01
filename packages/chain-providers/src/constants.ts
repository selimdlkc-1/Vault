// Confirmation (Faz 5 §5.5) — ağa özel N-blok onay eşikleri. Kaynak:
// `docs/mimari-kararlar.md` I-004 (Sepolia 12, BSC Testnet 15, Tron Shasta 19).
//
// Anahtarlar `networks.chain_id` string'leridir — `ChainProviderFactory` ve
// `RPC_ENV_KEY_BY_CHAIN_ID` ile aynı biçim (`apps/api/prisma/seed.ts`). Seed'deki
// `networks.confirmation_threshold` kolonu bu değerlerin birebir aynısını taşır
// (frontend "k/N blok" göstergesi için, `docs/01_DOMAIN_MODEL.md` §6); confirmation
// worker'ı bu sabiti kritik-modül kod yolunun bir parçası olarak burada kullanır
// (`.claude/rules/13-critical-modules.md` — eşik değeri "genişletilmez").

/** `networks.chain_id` → N-blok onay eşiği (`docs/mimari-kararlar.md` I-004). */
export const CONFIRMATION_THRESHOLDS: Readonly<Record<string, number>> = {
  "11155111": 12, // Sepolia
  "97": 15, // BSC Testnet
  shasta: 19, // Tron Shasta
};
