# Kalite Kapıları

## Coverage

`packages/chain-providers` ve `TransferStateMachine` servisi için **≥%80 unit coverage zorunlu** — CI'da bu eşiğin altına düşen bir PR merge edilemez. Projenin geneline sert bir eşik konmaz.

## CI Gate

Her PR'da sırayla: **lint → typecheck (`tsc --noEmit`) → unit/integration test → build**. Dördü de yeşil olmadan merge edilemez; branch protection bunu teknik olarak zorlar. Deploy adımı yoktur.

✓ Doğru: coverage eşiğinin altına düşen bir değişiklik için önce eksik testi tamamlamak.
✗ Yanlış: CI kırmızıyken "sonra düzeltirim" diyerek PR'ı kullanıcıya onaya sunmak.

## Bundle ve a11y

Frontend performans bütçesi ve WCAG 2.1 AA temel pratikleri (semantic HTML, klavye navigasyonu, form etiketleme, renk-bağımsız durum gösterimi) `docs/05` §8–9'da tanımlı eşiklere uyar. a11y geçişi Faz 7'de bütünsel yapılır ama her yeni ekran kendi temel pratiklerini (etiketli form alanı, odak yönetimi) baştan karşılar.

## Test yerleşimi

Unit/integration testler test edilen dosyayla aynı klasörde `*.spec.ts` (co-location); E2E testler `apps/web/e2e/*.e2e-spec.ts`.

---
Detay: `docs/08_TESTING_STRATEGY.md` §2, §7–8; `docs/05_FRONTEND_SPEC.md` §8–9
