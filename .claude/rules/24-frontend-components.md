---
paths:
  - "apps/web/src/components/**/*.tsx"
---

# Frontend Bileşenleri

Üç katman: `ui/` (primitive, shadcn/ui — CLI ile kopyalanır), `composite/` (birden fazla primitive'i birleştiren tekrar kullanılabilir parçalar, ör. `WalletBalanceRow`), `features/` (ekrana özel, tekrar kullanılmayan bileşenler).

## Para birimi gösterimi

Toplam portföy değeri her zaman **USDT** etiketiyle gösterilir; `$` veya başka bir fiat sembolü hiçbir bileşende kullanılmaz. Arayüzde her zaman "testnet varlıkları — gösterge değerdir" ibaresi bulunur (`TestnetDisclaimer` ortak bileşeni).

✓ Doğru: `<UsdtValue amount={...} />` — ortak bileşen üzerinden gösterim.
✗ Yanlış: bir ekranda ad-hoc `${value}` string'i basmak.

## a11y minimumları

Semantic HTML, klavye navigasyonu, form etiketleme (`label` + `htmlFor`), odak yönetimi, renk-bağımsız durum gösterimi (badge'ler yalnızca renkle değil metinle de durumu belirtir) — her yeni bileşen bu pratikleri baştan karşılar.

## Anti-pattern'ler

- Bir `features/` bileşenini başka bir ekranda tekrar kullanmaya çalışmak (bu durumda `composite/`'e taşınmalı)
- Durum bilgisini yalnızca renkle (yeşil/kırmızı nokta) verip metin etiketi eklememek

---
Detay: `docs/05_FRONTEND_SPEC.md` §6–8
