---
paths:
  - "apps/web/src/**/*.{ts,tsx}"
---

# Frontend Mimarisi

`apps/web/src` üç route grubu taşır: `(public)`, `(authenticated)`, `(admin)` — her biri kendi `layout.tsx`'ini taşır. Grup layout'ları sunucu tarafında (middleware) korumalı route kontrolü yapar ama bu yalnızca UX'tir; asıl yetki kontrolü her zaman backend'de tekrar yapılır.

## State sınırı

Server state (API'den gelen her şey) yalnızca **TanStack Query** ile yönetilir, ayrıca bir global state kütüphanesine kopyalanmaz. Client state (form anlık değeri, modal açık/kapalı) React `useState`/`useReducer` ile yönetilir. Bir veri API'den okunuyorsa TanStack Query'nin sorumluluğundadır.

✓ Doğru: cüzdan listesi `useWalletList()` (TanStack Query hook) ile okunur.
✗ Yanlış: API'den gelen veriyi `useState`'e kopyalayıp elle senkronize etmek.

## Access token istisnası

Access token yalnızca bellekte tutulan bir `AuthContext` değeridir; `localStorage`/`sessionStorage`'a **asla** yazılmaz (XSS riski). Sayfa yenilendiğinde kaybolur, `refresh` akışıyla yeniden alınır.

## API erişimi

Tüm backend çağrıları `lib/api-client.ts` merkezi fetch wrapper'ından geçer (access token header, hata çevirimi); bileşenler doğrudan `fetch`/`axios` çağırmaz.

## Anti-pattern'ler

- Access token'ı `localStorage`'a yazmak
- Server state için Redux/Zustand gibi ek bir kütüphane eklemek

---
Detay: `docs/05_FRONTEND_SPEC.md` §1–3
