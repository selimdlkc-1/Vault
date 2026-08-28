// chain-providers paketine özel exception'lar. Paket framework-agnostic'tir
// (NestJS'e bağımlı değil), bu yüzden düz `Error` alt sınıfları kullanılır;
// çağıran taraf (apps/api) bunları kendi HTTP exception filter'ında eşler.

/**
 * Allowlist dışı bir chain ID ile `IChainProvider` başlatılmaya çalışıldığında
 * fırlatılır. Mainnet chain ID'leri hiçbir koşulda allowlist'e girmez
 * (docs/mimari-kararlar.md SEC-005, CODE-004; .claude/rules/03-security-baseline.md).
 */
export class ChainIdNotAllowedException extends Error {
  readonly chainId: string;

  constructor(chainId: string, allowlist: readonly string[]) {
    const allowed = allowlist.length > 0 ? allowlist.join(", ") : "(boş)";
    super(
      `Chain ID "${chainId}" allowlist'te değil (izinli: ${allowed}). ` +
        "Mainnet veya allowlist dışı bir ağa bağlanılamaz.",
    );
    this.name = "ChainIdNotAllowedException";
    this.chainId = chainId;
  }
}

/**
 * Bu fazda arayüz imzası sabitlenir ama gövde henüz yoktur — `getBalance`
 * Faz 3 §3.2, `broadcastTransaction` Faz 5 tarafından doldurulacaktır.
 */
export class NotImplementedException extends Error {
  constructor(method: string) {
    super(`${method} henüz implemente edilmedi.`);
    this.name = "NotImplementedException";
  }
}
