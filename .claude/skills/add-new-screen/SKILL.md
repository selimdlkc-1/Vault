---
name: add-new-screen
description: Step-by-step procedure for adding a new screen/route in apps/web — route placement, layout group, data fetching hook, form validation, UX states (empty/loading/error/unauthorized/success), screen catalog ID. Use when the user asks to add a new page, screen, or route. Do NOT use for adding a new backend endpoint (see add-new-endpoint) or for a reusable component with no dedicated route.
---

# Yeni Ekran Ekleme Prosedürü

6 adım.

## 1. Route grubu ve konum

Ekranın hangi route grubuna ait olduğunu belirle: `(public)`, `(authenticated)`, `(admin)`. `apps/web/src/app/<grup>/<route>/page.tsx`.

## 2. Ekran ID

`docs/06_SCREEN_CATALOG.md` §3 konvansiyonuna göre bir `S-*` ID ata (yoksa dokümana ekle).

## 3. Veri çekme

Server state için TanStack Query hook'u yaz/kullan (`hooks/use<X>.ts`); doğrudan `fetch` çağırma, `lib/api-client.ts` üzerinden geçer.

```typescript
export function useWalletList() {
  return useQuery({ queryKey: walletKeys.list(), queryFn: () => apiClient.get('/wallets') });
}
```

## 4. Form (varsa)

`packages/types`'taki zod şemasıyla client-side validasyon; backend zaten aynı şemayla doğrular (tek kaynak).

## 5. UX durumları

Ekran şu durumları ayrı ayrı ele alır: boş, yükleniyor, hata, yetkisiz (403), başarı. `TestnetDisclaimer` gerekiyorsa ekle.

## 6. Dokümantasyon

- [ ] `docs/06_SCREEN_CATALOG.md` ekran ID + kısa açıklama ile güncellendi

---
Detay: `docs/06_SCREEN_CATALOG.md`; `docs/05_FRONTEND_SPEC.md` §2–5
