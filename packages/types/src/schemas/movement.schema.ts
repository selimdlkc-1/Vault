import { z } from "zod";

/**
 * Hareket yönü — Prisma `movement_direction` enum'ıyla birebir
 * (`docs/02_DATABASE_SCHEMA.md` §2.9/§3). `incoming` = cüzdana gelen,
 * `outgoing` = cüzdandan çıkan.
 */
export const movementDirectionSchema = z.enum(["incoming", "outgoing"]);
export type MovementDirectionValue = z.infer<typeof movementDirectionSchema>;

/**
 * Hareket kaynağı — `docs/03_API_CONTRACTS.md` §5.5, `docs/mimari-kararlar.md`
 * W-006. Faz 3'te yalnızca `chain` döner (`transfers` tablosu Faz 5'e kadar
 * yoktur); şema baştan iki değeri de taşır ki frontend filtre/badge kodu
 * değişmesin.
 */
export const movementSourceSchema = z.enum(["chain", "system"]);
export type MovementSourceValue = z.infer<typeof movementSourceSchema>;

/**
 * `GET /movements` query parametreleri — tek doğruluk kaynağı
 * (`docs/03_API_CONTRACTS.md` §5.5, §1 offset sayfalama sözleşmesi,
 * `docs/mimari-kararlar.md` W-007 filtre listesi). Aynı şema backend
 * `ZodValidationPipe`'ında ve S-MOVEMENTS ekranının (Faz 3 §3.6b) sorgu
 * anahtarında kullanılır.
 *
 * `page`/`pageSize` query string'den geldiği için `z.coerce.number()`; varsayılan
 * `page=1`, `pageSize=20`, üst sınır `100`. `dateFrom`/`dateTo` opsiyoneldir ve
 * `z.coerce.date()` ile `Date`'e çevrilir; aralık tutarlılığı (`dateTo >=
 * dateFrom`) servis katmanında (`MovementsService.listMovements`) kontrol edilir
 * — ikisi de `VALIDATION_FAILED` koduna eşlenir. `state` alanı Faz 3'te backend'de
 * etkisizdir (`source: 'system'` yok) ama spec'e göre baştan kabul edilir.
 * `.strict()` — tanımsız query alanı reddedilir.
 */
export const listMovementsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    walletId: z.string().uuid().optional(),
    networkId: z.string().uuid().optional(),
    assetId: z.string().uuid().optional(),
    direction: movementDirectionSchema.optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    state: z.string().optional(),
  })
  .strict();

export type ListMovementsQuery = z.infer<typeof listMovementsQuerySchema>;
