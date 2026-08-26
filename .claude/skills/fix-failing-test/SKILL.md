---
name: fix-failing-test
description: Step-by-step procedure for diagnosing and fixing a failing CI check (lint, typecheck, unit/integration test, or coverage gate) on an existing PR/branch. Use when the user reports CI is red, a test is flaky, or a coverage threshold dropped. Do NOT use for writing a new test for new functionality (that belongs to the feature's own procedure, e.g. add-new-endpoint step 6) or for an E2E-only flake unrelated to unit/integration.
---

# Başarısız Test Düzeltme Prosedürü

5 adım. CI gate sırası: lint → typecheck → unit/integration test → build (bkz. `04-quality-gates.md`).

## 1. Hangi adım kırıldı?

CI çıktısından hangi aşamanın (lint/typecheck/test/coverage) kırıldığını belirle — düzeltme stratejisi aşamaya göre değişir.

## 2. Test hatası ise: izole çalıştır

```
pnpm --filter api test -- <dosya-adı>.spec.ts
```

Testin gerçek bir davranış regresyonu mu yoksa test kodunun kendisindeki bir hata mı (ör. mock eksikliği, flaky timing) olduğunu ayır.

## 3. Coverage gate ise

`packages/chain-providers` veya `TransferStateMachine` %80 eşiğinin altındaysa, eksik dal için yeni bir unit test ekle — var olan testi gevşetip eşiği "geçirme".

## 4. Kritik modül regresyonu ise

Kırılan test `13-critical-modules.md` kapsamındaysa (cross-network guard, state machine, chain provider), kök nedeni düzelt ve ilgili negatif senaryonun hâlâ geçtiğini doğrula — yalnızca testi atlama/skip etme.

## 5. Dokümantasyon

- [ ] Kök neden PR açıklamasında bir cümleyle belirtildi (body zorunlu değil ama non-obvious bir düzeltmeyse eklenir)

---
Detay: `docs/08_TESTING_STRATEGY.md` §2, §7; `docs/09_DEV_WORKFLOW.md` §3
