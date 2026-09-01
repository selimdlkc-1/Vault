/**
 * `confirmation` kuyruğunun adı ve job sözleşmesi — bağımlılıksız ayrı dosyada
 * tutulur ki hem `ConfirmationProcessor` hem `BroadcastProcessor` (ilk poll'u
 * ekleyen) import cycle olmadan tüketebilsin (`docs/04_BACKEND_SPEC.md` §8).
 */

/** `docs/04_BACKEND_SPEC.md` §8 — transfer akışının üçüncü worker kuyruğu. */
export const CONFIRMATION_QUEUE = "confirmation";

/**
 * Periyodik fan-out: `broadcast`/`confirming` durumundaki tüm transfer'leri tek
 * tek `poll-one` job'una böler (`balance-sync`/`movement-index` kalıbı). Sürekli
 * çalışan tek repeatable scheduler.
 */
export const POLL_ALL_JOB = "poll-all";

/** Tek bir transfer'in blok derinliğini kontrol eden job. */
export const POLL_ONE_JOB = "poll-one";

/**
 * `poll-one` polling aralığı — `docs/mimari-kararlar.md` I-004'ün (blok eşiği)
 * ötesinde bir uygulama detayı; testnet blok sürelerine göre 15 sn sabit seçilir
 * (`docs/04_BACKEND_SPEC.md` §8 "kısa aralıklı polling").
 */
export const CONFIRMATION_POLL_INTERVAL_MS = 15_000;

/** Repeatable scheduler'ın sabit job id'si — tekrar eklense de tek scheduler kalır. */
export const CONFIRMATION_SCHEDULER_JOB_ID = "confirmation-scheduler";

/** `poll-one` job payload'ı — id'den fazlası taşınmaz, bağlam DB'den okunur. */
export interface ConfirmationJobData {
  transferId: string;
}

/** `(transferId)` bileşik anahtarı — bir tur içinde çift `poll-one` engellenir. */
export const confirmationJobId = (transferId: string): string =>
  `${CONFIRMATION_QUEUE}:${transferId}`;

/**
 * `poll-one` job seçenekleri (`movement-index` `PER_PAIR_JOB_OPTS` kalıbı):
 * tamamlanan/başarısız job kuyruktan düşürülür ki bir sonraki tur aynı
 * `confirmationJobId`'yi tekrar ekleyebilsin. `attempts` yok — RPC hatası
 * worker içinde yutulur, bir sonraki tur yeniden dener.
 */
export const CONFIRMATION_POLL_ONE_OPTS = {
  removeOnComplete: true,
  removeOnFail: true,
} as const;
