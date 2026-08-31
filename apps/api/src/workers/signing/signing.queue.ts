/**
 * `signing` kuyruğunun adı ve job sözleşmesi — bağımlılıksız ayrı dosyada
 * tutulur ki hem `SigningProcessor` hem `TransfersService` (job ekleyen) import
 * cycle olmadan tüketebilsin (`docs/04_BACKEND_SPEC.md` §8).
 */

/** `docs/04_BACKEND_SPEC.md` §8 — transfer akışının ilk worker kuyruğu. */
export const SIGNING_QUEUE = "signing";

/** `TransfersService.confirm()` bu adla iş bırakır; payload `{ transferId }`. */
export const SIGN_JOB = "sign";

/** `sign` job payload'ı. */
export interface SignJobData {
  transferId: string;
}
