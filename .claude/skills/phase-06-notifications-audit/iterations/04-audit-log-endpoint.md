### İterasyon 4 — Audit Log Okuma Endpoint'i (§6.3a)

**Hedef:** `GET /admin/audit-logs` filtrelenebilir (`actorType`, `actorId`, `entityType`, `action`, `dateFrom`, `dateTo`) şekilde çalışıyor; yalnızca `Admin` rolü erişebiliyor.

**Teslim çıktısı:**
- `admin/admin-audit-logs.controller.ts` (veya `admin.controller.ts` genişletmesi) + `dto/list-audit-logs.dto.ts`
- `admin` modülünde okuma repository'si — `audit_logs` tablosunu doğrudan okur (yazma tarafı `audit/audit.service.ts`'te kalır, bu iterasyon ona dokunmaz)

**Önkoşullar:**
- [ ] `audit_logs` tablosu ve `AuditService` (yazma) Faz 2 §2.3'ten beri mevcut

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §6.3 — kapsam ve a/b bölünme notu
2. `docs/03_API_CONTRACTS.md` §5.8 Admin — `GET /admin/audit-logs` tam sözleşme
3. `docs/02_DATABASE_SCHEMA.md` §2.12 `audit_logs` — kolon listesi, index'ler (`audit_logs_actor_idx`, `audit_logs_entity_idx`, `audit_logs_created_at_idx` — filtrelerin bu index'lere karşılık geldiği doğrulanır)
4. `docs/04_BACKEND_SPEC.md` §2 Klasör Yapısı — `admin/` modülünün ("mint + audit log + kullanıcı verisi görüntüleme") `audit/` modülünden (yalnızca yazma) ayrı sorumluluğu

**Uygulama planı:**
1. `git-phase-branch` ile `feat/audit-log-endpoint` branch'i aç.
2. `packages/types/src/schemas/audit-log.schema.ts`: `listAuditLogsQuerySchema = z.object({ page, pageSize, actorType, actorId, entityType, action, dateFrom, dateTo }.optional çiftleri ile)`.
3. `admin/admin-audit-logs.repository.ts`: `findAll(filters, pagination)` — opsiyonel filtrelere göre `WHERE` koşulları kurulur, `ORDER BY created_at DESC` (`docs/02` `audit_logs_created_at_idx`).
4. `admin.service.ts` (veya yeni `admin-audit-logs.service.ts`) genişletmesi: `listAuditLogs(query)` → `{data, pagination}`; `AuditService.record()` çağrılmaz (okuma audit'e yazılmaz, `docs/03` §5.8 notu).
5. Controller: `GET /admin/audit-logs` — `@Roles('admin')`, `ZodValidationPipe(listAuditLogsQuerySchema)`.
6. Integration test: filtresiz liste, `actorType` filtresi, `dateFrom`/`dateTo` filtresi, `User` rolüyle erişim denemesi `403`.
7. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `admin/admin-audit-logs.repository.ts`, `admin/dto/list-audit-logs.dto.ts`, `packages/types/src/schemas/audit-log.schema.ts`, ilgili `.spec.ts` |
| Güncelle | `admin.controller.ts`, `admin.service.ts`, `admin.module.ts` (repository/controller kaydı) |
| Dokunma | `audit/audit.service.ts` (yalnızca yazma tarafı — `record()` metoduna dokunulmaz, bu iterasyon yalnızca okur) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| 6 opsiyonel filtre | `docs/03` §5.8 | `actorType`/`actorId`/`entityType`/`action`/`dateFrom`/`dateTo` |
| Admin-only | `docs/03` §5.8 | `@Roles('admin')`, `403 FORBIDDEN_ROLE` |
| Okumak audit'e yazılmaz | `docs/03` §5.8 | `listAuditLogs()` `AuditService.record` çağırmaz |
| `created_at DESC` sıralama | `docs/02` `audit_logs_created_at_idx` | `ORDER BY created_at DESC` |

**Kalite kapıları:**
- [ ] Integration: filtresiz + `actorType` + `dateFrom`/`dateTo` senaryoları
- [ ] Deny: `User` rolüyle erişim → `403 FORBIDDEN_ROLE` (`docs/08` §4 madde 6)
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** S-ADMIN-AUDIT-LOG ekranı (İterasyon 5); audit log tamper-evidence (`mimari-kararlar` AUD-OPEN-2, MVP dışı).

**Risk / dikkat:** `entity_id` FK olmadığından (`docs/02` §2.12 zayıf referans notu) `entityType` filtresi yalnızca `TEXT` eşleşmesidir — silinmiş/var olmayan bir entity'ye ait kayıt da filtrede görünmeye devam eder, bu kasıtlıdır (append-only + zayıf referans tasarımı); ekstra bir "entity var mı" kontrolü eklenmez.

**Stop:**
- [ ] `pnpm --filter api test -- audit-log`
- [ ] lint/typecheck yeşil
- [ ] PR/onay → İterasyon 5
