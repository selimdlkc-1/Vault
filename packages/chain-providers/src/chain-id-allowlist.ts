import { ChainIdNotAllowedException } from "./exceptions";

// Bu paket kendi env'ini OKUMAZ — `allowlist` her zaman çağırandan gelir
// (apps/api'de `ConfigService` üzerinden `CHAIN_ID_ALLOWLIST`, virgülle ayrılmış
// ve parse edilmiş hâlde). Böylece paket bağımsız test edilebilir kalır ve
// allowlist'in tek doğruluk kaynağı apps/api ortam yapılandırmasıdır
// (docs/04_BACKEND_SPEC.md §10, docs/09_DEV_WORKFLOW.md §7).

/**
 * `chainId` verilen allowlist içinde değilse `ChainIdNotAllowedException`
 * fırlatır. Boş/geçersiz bir allowlist de fail-fast reddedilir — hiçbir ağ
 * "varsayılan olarak izinli" değildir (docs/mimari-kararlar.md SEC-005).
 *
 * Bu fonksiyon her `IChainProvider` implementasyonunun constructor'ının
 * ilk satırında çağrılır.
 */
export function assertChainIdAllowed(chainId: string, allowlist: readonly string[]): void {
  if (!Array.isArray(allowlist) || allowlist.length === 0) {
    throw new ChainIdNotAllowedException(chainId, []);
  }

  if (!allowlist.includes(chainId)) {
    throw new ChainIdNotAllowedException(chainId, allowlist);
  }
}
