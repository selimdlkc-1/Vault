import { z } from "zod";

/**
 * `GET /portfolio/history` query parametreleri — tek doğruluk kaynağı
 * (`docs/03_API_CONTRACTS.md` §5.6). Aynı şema backend `ZodValidationPipe`'ında
 * ve dashboard geçmiş grafiğinin (Faz 3 §3.5a) sorgu anahtarında kullanılır.
 *
 * `dateFrom`/`dateTo` zorunludur ve query string'den geldiği için
 * `z.coerce.date()` ile `Date`'e çevrilir (ISO tarih veya tarih-saat kabul
 * edilir). Aralık tutarlılığı (`dateTo >= dateFrom`) burada değil, servis
 * katmanında (`PortfolioService.getHistory`) kontrol edilir — ikisi de aynı
 * `VALIDATION_FAILED` koduna eşlenir (`docs/03` §3). `.strict()` — tanımsız
 * query alanı reddedilir.
 */
export const portfolioHistoryQuerySchema = z
  .object({
    dateFrom: z.coerce.date(),
    dateTo: z.coerce.date(),
  })
  .strict();

export type PortfolioHistoryQuery = z.infer<typeof portfolioHistoryQuerySchema>;
