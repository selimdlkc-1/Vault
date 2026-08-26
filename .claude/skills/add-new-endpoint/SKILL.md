---
name: add-new-endpoint
description: Step-by-step procedure for adding or modifying a REST endpoint in apps/api — DTO, zod validation, guard wiring, service logic, repository call, audit log, response envelope, contract doc update. Use when the user asks to add an endpoint, expose a new route, or change an existing controller's request/response signature. Do NOT use for BullMQ worker/processor logic (no HTTP surface) or for frontend data fetching (see add-new-screen).
---

# Yeni Endpoint Ekleme Prosedürü

7 adım. Her adım bir concern — atlamak review/CI maliyeti yaratır.

## 1. DTO ve zod şema

`packages/types` içinde zod şeması tanımla (varsa mevcut ilgili şemayı genişlet). `apps/api/src/<module>/dto/*.dto.ts` bu şemadan türetilir.

## 2. Guard ve yetkilendirme

`@Roles()` gerekiyorsa ekle; kaynak-bazlı endpoint'se (cüzdan, transfer) service katmanında ownership kontrolü planla. Network/asset'e bağlıysa aktivasyon kontrolünü unutma.

`apps/api/src/<module>/*.controller.ts`

## 3. Controller

```typescript
@Post()
@UseGuards(JwtAuthGuard)
create(@Body() dto: CreateXDto, @CurrentUser() user: User) {
  return this.xService.create(dto, user.id);
}
```

Controller'da iş kuralı yazma — yalnızca servise devret, envelope'a sar.

## 4. Service — iş mantığı

İş kuralları, cross-network guard (ilgiliyse), audit yazımı burada. `13-critical-modules.md` kapsamındaysa (transfers) `TransferStateMachine` üzerinden geçiş yap, doğrudan `UPDATE` yazma.

## 5. Repository

Yalnızca sorgu/yazma; iş kuralı yok.

## 6. Test

Unit test (service), gerekiyorsa integration test (controller→repository uçtan uca). Kritik modülse (bkz. `13-critical-modules.md`) ilgili negatif senaryoyu ekle.

## 7. Dokümantasyon

- [ ] `docs/03_API_CONTRACTS.md` yeni/değişen endpoint ile güncellendi

---
Detay: `docs/03_API_CONTRACTS.md`; `docs/04_BACKEND_SPEC.md` §5–6; `docs/07_SECURITY_IMPLEMENTATION.md`
