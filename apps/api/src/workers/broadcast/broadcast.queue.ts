/**
 * `broadcast` kuyruğunun adı ve job sözleşmesi — bağımlılıksız ayrı dosyada
 * tutulur ki hem `BroadcastProcessor` hem `SigningProcessor` (job ekleyen)
 * import cycle olmadan tüketebilsin (`docs/04_BACKEND_SPEC.md` §8).
 */

/** `docs/04_BACKEND_SPEC.md` §8 — transfer akışının ikinci worker kuyruğu. */
export const BROADCAST_QUEUE = "broadcast";

/** `SigningProcessor` başarılı imzalamanın sonunda bu adla iş bırakır. */
export const BROADCAST_JOB = "broadcast";

/**
 * `broadcast` job payload'ı. `signedTx`, `signing` worker'ının ürettiği imzalı
 * ham işlemdir (EVM: `0x`-önekli hex; Tron: `JSON.stringify` edilmiş imzalı
 * işlem) — ağa `IChainProvider.broadcastTransaction()` ile gönderilir.
 */
export interface BroadcastJobData {
  transferId: string;
  signedTx: string;
}

/**
 * `docs/mimari-kararlar.md` I-006 — RPC çağrılarında exponential backoff,
 * maks 5 deneme; worker kendi retry döngüsünü yazmaz. Bu seçenekler job
 * kuyruğa eklenirken (`SigningProcessor`) verilir, processor'ın kendisinde
 * değil.
 */
export const BROADCAST_JOB_OPTS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1000 },
} as const;
