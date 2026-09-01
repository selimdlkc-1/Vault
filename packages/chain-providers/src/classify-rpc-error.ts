// Broadcast aşamasında (Faz 5 §5.4) bir `broadcastTransaction()` çağrısı
// başarısız olduğunda, hatanın **kalıcı** mı (retry anlamsız — nonce/gas/bakiye,
// imzalı işlem artık geçersiz) yoksa **geçici** mi (RPC/ağ dalgalanması, tekrar
// denenebilir) olduğunu ayırt eder. `broadcast` worker'ı bu sonuca göre:
//   - `permanent` → tek denemede `signed → failed`
//   - `transient` → exception'ı yeniden fırlatır, BullMQ `attempts`/`backoff`
//     retry'ı devralır (`docs/mimari-kararlar.md` I-006)
//
// Sınıflandırma her iki ağ ailesinde (EVM ethers v6 + Tron tronweb) ortak
// yaşar; worker ağ tipine bakmaz. `docs/01_DOMAIN_MODEL.md` §5.2 `signed →
// broadcast` notu: "RPC hatası (nonce/gas yetersizliği) `failed`'e düşürür;
// geçici ağ hatasında (timeout) exponential backoff ile yeniden denenir".

export type RpcErrorKind = "permanent" | "transient";

/**
 * ethers v6 `error.code` değerleri + Tron hata kodları — imzalı işlem kalıcı
 * olarak reddedilmiştir, aynı ham işlemi tekrar yayınlamak aynı sonucu verir.
 */
const PERMANENT_CODES: ReadonlySet<string> = new Set([
  // ethers v6
  "INSUFFICIENT_FUNDS",
  "NONCE_EXPIRED",
  "REPLACEMENT_UNDERPRICED",
  "UNPREDICTABLE_GAS_LIMIT",
  "CALL_EXCEPTION",
  "TRANSACTION_REPLACED",
  "INVALID_ARGUMENT",
  "NUMERIC_FAULT",
  // Tron (`BroadcastReturn.code`)
  "SIGERROR",
  "CONTRACT_VALIDATE_ERROR",
  "CONTRACT_EXE_ERROR",
  "TRANSACTION_EXPIRATION_ERROR",
  "TOO_BIG_TRANSACTION_ERROR",
  "BANDWITH_ERROR",
  "TAPOS_ERROR",
  "DUP_TRANSACTION_ERROR",
]);

/**
 * Geçici sağlayıcı/ağ hataları — aynı imzalı işlemle tekrar deneme başarılı
 * olabilir.
 */
const TRANSIENT_CODES: ReadonlySet<string> = new Set([
  // ethers v6
  "TIMEOUT",
  "NETWORK_ERROR",
  "SERVER_ERROR",
  "BAD_DATA",
  "CANCELLED",
  // Node soket hataları
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  // Tron
  "SERVER_BUSY",
  "BLOCK_UNSOLIDIFIED",
]);

/** Mesaj içinde geçen kalıcı-hata kalıpları (kod taşımayan RPC hataları için). */
const PERMANENT_PATTERNS: readonly string[] = [
  "insufficient funds",
  "insufficient balance",
  "balance is not sufficient",
  "nonce too low",
  "nonce has already been used",
  "already known",
  "replacement transaction underpriced",
  "transaction underpriced",
  "intrinsic gas too low",
  "gas required exceeds",
  "exceeds block gas limit",
  "invalid sender",
  "invalid signature",
  "validate signature error",
  "contract validate error",
  "account not exists",
  "bandwidth is not enough",
  "transaction expired",
];

/** Mesaj içinde geçen geçici-hata kalıpları. */
const TRANSIENT_PATTERNS: readonly string[] = [
  "timeout",
  "timed out",
  "socket hang up",
  "network error",
  "could not detect network",
  "failed to fetch",
  "connection reset",
  "connection refused",
  "bad gateway",
  "gateway timeout",
  "service unavailable",
  "server busy",
  "too many requests",
  "rate limit",
  "503",
  "502",
  "504",
];

/**
 * `error` (ve varsa iç içe `cause` zinciri) üzerinden dolaşarak ilk eşleşen
 * sınıfı döner. `broadcastTransaction()` hatayı `ChainProviderUnavailableException`'a
 * sardığından (`{ cause }`), asıl RPC hatası `cause` üzerinden bulunur.
 *
 * Eşleşme bulunamazsa **`"transient"`** döner: bilinmeyen bir hatayı gereksiz
 * yere 5 kez denemek (kullanıcıyı yavaşlatır, veri bütünlüğü bozulmaz) — aslında
 * başarılı olabilecek bir transferi erkenden `failed`'e düşürmekten (kullanıcının
 * transferi kaybettiği hissi) tercih edilir (iterasyon 4 "Risk / dikkat" notu).
 */
export function classifyRpcError(error: unknown): RpcErrorKind {
  for (const node of causeChain(error)) {
    const code = readString(node, "code").toUpperCase();
    if (code && PERMANENT_CODES.has(code)) {
      return "permanent";
    }
    if (code && TRANSIENT_CODES.has(code)) {
      return "transient";
    }

    const haystack = [
      readString(node, "message"),
      readString(node, "shortMessage"),
      readString(node, "reason"),
    ]
      .join(" ")
      .toLowerCase();

    if (PERMANENT_PATTERNS.some((pattern) => haystack.includes(pattern))) {
      return "permanent";
    }
    if (TRANSIENT_PATTERNS.some((pattern) => haystack.includes(pattern))) {
      return "transient";
    }
  }

  return "transient";
}

/** `error` → `error.cause` → ... zincirini döner (döngü koruması ile). */
function* causeChain(error: unknown): Generator<unknown> {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current != null && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    yield current;
    current = (current as { cause?: unknown }).cause;
  }
}

/** `obj[key]` string ise döner, değilse boş string. */
function readString(obj: unknown, key: string): string {
  if (obj == null || typeof obj !== "object") {
    return "";
  }
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}
