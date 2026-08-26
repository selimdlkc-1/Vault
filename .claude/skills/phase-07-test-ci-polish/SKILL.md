---
name: phase-07-test-ci-polish
description: '[Faz 7] Test/CI Sıkılaştırma ve Polish — 6 iterasyon/chat (coverage tamamlama + CI gate → kalan negatif senaryolar → Playwright E2E → sistem ekranları → a11y geçişi → güvenlik checklist doğrulaması). Use when the user says "Faz 7", "Faz 7 — İterasyon N", veya coverage tamamlama, kalan deny senaryoları, Playwright/E2E, S-ERROR-404/500/403, a11y geçişi, güvenlik checklist doğrulamasından bahseder. Do NOT use for Faz 0-6''nın kendi özellik implementasyonu (yeni endpoint/ekran/domain işlevi bu fazın kapsamı dışıdır).'
---

# Faz 7: Test/CI Sıkılaştırma ve Polish

## Goal

Faz 0-6'nın ürettiği tüm işlevin üzerine son sıkılaştırma geçişi: `packages/chain-providers` ve `TransferStateMachine` coverage'ı %80'e tamamlanır ve CI'a otomatik reddeden bir gate olarak eklenir; 12 zorunlu deny senaryosundan Faz 5 §5.7'de kapsanmayan 4'ü (yetkisiz erişim ×2, rate limit, adres formatı) tamamlanır; Playwright ile 2 E2E senaryosu yazılır; 3 sistem ekranı (S-ERROR-404, S-ERROR-500, S-FORBIDDEN-403) üretilir; tüm ekranlarda WCAG 2.1 AA temel pratikleri manuel geçişten geçirilir; 6 maddelik güvenlik checklist'i kod tabanına karşı son kez doğrulanır. Bu faz **yeni işlev eklemez**, mevcut işlevi sağlamlaştırır — `docs/10_IMPLEMENTATION_ROADMAP.md` §7 Başarı Metrikleri'ndeki 10 kriter, Faz 7'nin kapanış tanımıdır ve aynı zamanda projenin MVP tamamlanma noktasıdır.

## Feature branch (zorunlu)

Her iterasyon kendi branch'ini `git-phase-branch` skill'i ile açar. İterasyon 1 öncesi: Faz 0-6'nın **tüm** alt maddelerinin (`docs/10` §0.1–§6.4b) tamamlanmış ve onaylanmış olduğu doğrulanır — bu faz test edilecek/sıkılaştırılacak işlevin var olmasını önkoşul sayar (`docs/10` §2 Faz 7 bağımlılık gerekçesi).

## Bu fazın çalışma modeli

- Tek sohbet fazı bitirmez; her chat başında **「Faz 7 — İterasyon M」** belirt.
- Agent yalnızca o iterasyonun **Docs okuma sırasını** okur, tüm spec'i değil.
- Bu fazın ihtiyaç duyduğu tüm `docs/` bölümleri (`docs/06` §5.3, `docs/07` §13, `docs/08` tüm ilgili bölümler, `docs/05` §8-9) **daha önceki fazlarda zaten tam yazılmıştır** — bu fazın hiçbir iterasyonu `docs/` dosyalarını güncellemez, yalnızca uygular ve doğrular.
- `docs/08` §7 CI Gate yalnızca 4 adımı listeler (lint→typecheck→test→build); **E2E (İterasyon 3) CI gate'inin parçası değildir** — Playwright testleri yerel/manuel çalıştırılır, hiçbir iterasyon E2E'yi CI workflow'una zorunlu adım olarak eklemez.
- İterasyon 1'in coverage gate'i, `docs/08` §2'deki iki modülle (yalnızca `packages/chain-providers` ve `TransferStateMachine`) sınırlıdır; projenin geneline sert bir eşik eklenmez (`docs/08` §2 gerekçe, `mimari-kararlar.md` TEST-002).
- İterasyon 2, `docs/08` §4'teki 12 senaryodan yalnızca roadmap'in `§7.2` metninde açıkça saydığı 4'ünü (`FORBIDDEN_NOT_OWNER`, `FORBIDDEN_ROLE`, `RATE_LIMIT_EXCEEDED`, `WALLET_ADDRESS_INVALID_FORMAT`) ekler — kalan 8 senaryo (cross-network, terminal state, step-up, watch-only'den transfer, yetersiz bakiye Faz 5 §5.7'de; refresh replay Faz 1 §1.4'te; mainnet allowlist Faz 2 §2.5'te) daha önce regresyon testine girmiştir, tekrar yazılmaz.
- İterasyon 6 (güvenlik checklist doğrulaması) **yeni bir araç veya otomatik denetim script'i yazmaz** — kalıcı kalite kapısı zaten `.claude/rules/03-security-baseline.md`'dir (her oturumda otomatik yüklenir); bu iterasyon kod tabanını 6 maddeye karşı gezip kanıt bulur, eksik çıkan yeri düzeltir.

## İterasyon indeksi

| # | Teslim | §N.M | Dosya |
| - | ------ | ---- | ----- |
| 1 | Coverage tamamlama (`chain-providers` + `TransferStateMachine` ≥%80) + CI coverage gate | §7.1 | `iterations/01-coverage-completion-ci-gate.md` |
| 2 | Kalan 4 negatif/deny senaryosu (yetkisiz erişim ×2, rate limit, adres formatı) | §7.2 | `iterations/02-remaining-deny-scenarios.md` |
| 3 | Playwright E2E: ana kullanıcı akışı + watch-only cüzdan ekleme | §7.3 | `iterations/03-e2e-playwright.md` |
| 4 | S-ERROR-404, S-ERROR-500, S-FORBIDDEN-403 | §7.4 | `iterations/04-system-error-screens.md` |
| 5 | a11y manuel geçişi (tüm ekranlar) | §7.5 | `iterations/05-accessibility-pass.md` |
| 6 | Güvenlik checklist doğrulaması (6 madde) | §7.6 | `iterations/06-security-checklist-verification.md` |

> Yalnızca çalıştığın iterasyonun dosyasını oku.

## Required Context

- `docs/10_IMPLEMENTATION_ROADMAP.md` §3 Faz 7 (§7.1–§7.6) ve §7 Başarı Metrikleri (10 kriter — Faz 7'nin kapanış tanımı) ve §4 Human Gate Noktaları
- `docs/08_TESTING_STRATEGY.md` — tüm bölümler bu fazın farklı iterasyonlarına dağılır (§2 coverage, §4 deny senaryoları, §6 E2E journey, §7 CI gate)
- `docs/07_SECURITY_IMPLEMENTATION.md` §13 Güvenlik Checklist Özeti
- `docs/06_SCREEN_CATALOG.md` §5.3 Sistem Ekranları
- `docs/05_FRONTEND_SPEC.md` §8 Erişilebilirlik (a11y) Minimumları
- `docs/mimari-kararlar.md` TEST-001/002/003 (test piramidi, coverage, mock RPC), SEC-001..012 (güvenlik checklist kaynağı)
- `.claude/rules/00-*.md` … `04-*.md` — zaten yüklü, tekrar edilmez; özellikle `03-security-baseline.md` (İterasyon 6'nın doğrulama listesi) ve `04-quality-gates.md` (İterasyon 1'in coverage/CI referansı)
- `.claude/skills/phase-06-notifications-audit/SKILL.md` — komşu faz formatı referansı

## Done Definition

`docs/10_IMPLEMENTATION_ROADMAP.md` §7 Başarı Metrikleri'ndeki 10 kriterin tamamı — bu faz tamamlandığında liste tam karşılanmış olmalıdır:

- [ ] Kriter 5: `packages/chain-providers` ve `TransferStateMachine` ≥%80 unit coverage, CI bunu otomatik doğruluyor
- [ ] Kriter 8: Cross-network mismatch, terminal state, step-up başarısız, yetkisiz erişim, watch-only'den transfer, yetersiz bakiye, refresh replay, rate limit aşımı, mainnet allowlist reddi dahil tüm kritik negatif/deny senaryoları otomatik test setinde mevcut ve geçiyor
- [ ] Kriter 9: 6 temel güvenlik kuralının tamamı kod tabanında karşılanıyor (doğrulanmış, kanıtlanmış)
- [ ] Kriter 10: 21 ekranın tamamı kendi UX durumlarıyla (boş, yükleniyor, hata, yetkisiz, başarı) çalışır durumda — sistem ekranları (404/500/403) dahil
- [ ] Ana kullanıcı akışı ve watch-only ekleme E2E senaryoları Playwright ile geçiyor
- [ ] Tüm ekranlar a11y minimumlarını (semantic HTML, klavye navigasyonu, form etiketleme, odak yönetimi, renk-bağımsız durum, alt metin) karşılıyor
- [ ] CI'ın 4 adımı (lint→typecheck→test→build) yeşil, coverage gate dahil

## Explicit Don'ts

- Faz 0-6'da tanımlanmamış yeni bir endpoint, ekran veya domain işlevi eklemek — bu faz yalnızca sıkılaştırır (`docs/00_PROJECT_OVERVIEW.md` MVP kapsamı sabit kalır).
- axe/Lighthouse gibi otomatik a11y denetim aracı kurmak veya sert bir a11y skoru eşiği koymak — `docs/05` §8 bilinçli olarak sert eşik koymuyor.
- Bundle boyutu bütçesi veya Core Web Vitals eşiği eklemek — `docs/05` §9.
- SAST aracı (Snyk vb.) kurmak — `mimari-kararlar.md` SEC-OPEN-7, MVP dışı.
- E2E testlerini CI workflow'una zorunlu adım olarak eklemek — `docs/08` §7 CI Gate 4 adımla sınırlı.
- `docs/08` §4'teki 12 senaryodan İterasyon 2'nin kapsamı dışındaki 8'ini (önceki fazlarda zaten kapsanmış) yeniden yazmak.
- İterasyon 6'da yeni bir otomatik checklist-doğrulama script'i/aracı icat etmek — kalıcı kapı `.claude/rules/03-security-baseline.md`.

---
Faz bitti → `docs/10_IMPLEMENTATION_ROADMAP.md` §7 Başarı Metrikleri kullanıcıya özetlenir; bu, projenin MVP tamamlanma noktasıdır, sonraki faz yoktur.
