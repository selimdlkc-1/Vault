# Verification Matrix — Phase Controller

Her faz audit'inde uygulanacak boyutlar. Faz tipine göre **minimum set** zorunlu; diğerleri N/A ise gerekçe yaz.

Kaynak faz tipi → minimum docs: `~/.claude/skills/phase-creator/docs-map.md`.

Aşağıdaki kod kanıt yöntemlerinde geçen decorator, dosya ve komut adları **örnektir** — projenin gerçek stack'ine göre `.claude/rules/` ve `Docs/04`/`05`'ten karşılığını çıkar. Uydurma desenle grep atma.

---

## Boyut özeti

| ID | Boyut | Birincil spec | Kod kanıt yöntemi |
| -- | ----- | ------------- | ----------------- |
| D1 | Done Definition | Faz skill §Done Definition | Checklist ↔ dosya/test varlığı |
| D2 | İterasyon hedefleri | Faz skill §İterasyon / `iterations/` | Modül/route/API listesi |
| D3 | API contract | `Docs/03` | Controller/router, DTO, route prefix |
| D4 | Ekran kataloğu | `Docs/06` `S-*` | Route, page, permission gate |
| D5 | DB şema | `Docs/02` | Şema dosyası, migration |
| D6 | Güvenlik baseline | `.claude/rules/03-security-baseline.md`, `Docs/07` | Guard, decorator, masking grep |
| D7 | Explicit Don'ts | Faz skill | Anti-pattern taraması |
| D8 | Scope creep | Faz skill §Dosya kapsamı "Dokunma" | Yeni dosya vs izinli scope |
| D9 | Test & coverage | `Docs/08`, Done Definition | Test dosyaları, CI script |
| D10 | Pattern tutarlılığı | `.claude/rules/` path-scoped (10–2x) | Error code, validation, audit |
| D11 | Roadmap deliverable | `Docs/10` §Faz N | Deliverable listesi |
| D12 | UAT hazırlık | `Docs/11` §Faz N | Not — otomatik PASS yok |

---

## D1 — Done Definition

1. Faz skill'inin Done Definition maddelerini tabloya çıkar
2. Her madde için: ✅ kanıt | ❌ bulgu | ➖ N/A
3. ❌ → `MISSING` veya `WRONG`; severity maddenin kritikliğine göre

**Kritik modül eşiği** (`.claude/rules/04-quality-gates.md`): authz, workflow, document, audit, crypto, notification benzeri modüllerde eksik test/coverage = min HIGH.

---

## D2 — İterasyon hedefleri

1. Her iterasyonun **Hedef** satırını oku (`iterations/` bölünmüşse hepsini tara)
2. **Uygulama planı** maddelerini `Grep`/`Glob` ile doğrula
3. **Bu iterasyonda yok** maddelerinin implemente edilmediğini doğrula (scope creep tersi)

İterasyon kısmi tamamlanmışsa: `HIGH` (Hedef cümlesi karşılanmıyor).

---

## D3 — API contract

1. `Docs/03` ilgili bölümdeki endpoint listesi
2. Route tanımı grep (controller/router dosyaları, method + path)
3. Yetki kontrolü — mutating + internal read
4. Audit kaydı — mutating işlemler
5. Validation şeması — paylaşılan DTO paketi
6. Error code — merkezi sabit dosyası, magic string yok

| Sapma | Tip | Severity |
| ----- | --- | -------- |
| Endpoint yok | MISSING | BLOCKER (core) / HIGH |
| Yetki kontrolü eksik | SECURITY | BLOCKER |
| Audit eksik (mutating) | SECURITY | HIGH |
| Yanlış path/method | WRONG | HIGH |

---

## D4 — Ekran kataloğu

1. `Docs/06` `S-*` ID listesi
2. Route ve sayfa dosyaları
3. Permission gate — UX-only notu; backend deny ayrı D6
4. UI dil/label spot-check (opsiyonel LOW)

Eksik route/page → `MISSING` HIGH. Spec dışı ekran → `EXTRA` MEDIUM.

---

## D5 — DB şema

1. `Docs/02` tablo/kolon
2. Şema dosyası
3. Migration varlığı
4. Şifreli alanlar — merkezi crypto servisi, doğrudan crypto import yok (D6 overlap)

Eksik tablo/kolon → BLOCKER (data model). Index eksik → MEDIUM (defer edilebilir — not düş).

---

## D6 — Güvenlik baseline

`.claude/rules/03-security-baseline.md` checklist'inden faz kapsamına giren maddeler:

| # | Kontrol | Kanıt |
| - | ------- | ----- |
| 1 | Auth/session | Auth modülü, cookie flag testi |
| 2 | Yetkilendirme katmanları | Guard, scope, field masking |
| 3 | Encryption | Crypto servisi kullanımı |
| 4 | Input/dosya | Whitelist validation, upload pipeline |
| 5 | Audit | Aynı transaction içinde kayıt |
| 6 | KVKK/non-prod | Sentetik seed, template'te PII yok |

İhlal → `SECURITY` BLOCKER veya HIGH.

**Onay akışı olan fazlar:** maker ≠ checker backend deny testi zorunlu HIGH.

---

## D7 — Explicit Don'ts

Faz skill §Explicit Don'ts — her madde:

- İhlal kanıtı varsa → BLOCKER veya HIGH (metnin ciddiyetine göre)
- Uyumlu → tabloda ✅

Örnek: "Maker-checker UI-only" → backend same-user deny testi yok = BLOCKER.

---

## D8 — Scope creep

1. Faz skill'indeki Dosya kapsamı "Dokunma" satırları
2. `git diff main...HEAD --name-only` (branch belirtildiyse)
3. Sonraki faz dosya/ekran/feature listesiyle çakışma

`EXTRA` — MEDIUM (bilinçli hazırlıksa INFO + defer notu).

---

## D9 — Test & coverage

1. Done Definition test maddeleri
2. `Docs/08` — negatif deny senaryosu en az 1 (auth/workflow/document)
3. CI komut çıktısı (read-only)
4. Coverage script varsa eşik kontrolü

| Durum | Tip | Severity |
| ----- | --- | -------- |
| Test dosyası yok | TEST_GAP | HIGH (kritik modül) |
| Deny senaryosu yok | TEST_GAP | HIGH |
| CI fail | TEST_GAP | BLOCKER |
| Coverage eşik altı | TEST_GAP | HIGH |

---

## D10 — Pattern tutarlılığı

Spot-check (tüm repo değil — faz scope dosyaları). Beklenen pattern'i `.claude/rules/` path-scoped kurallarından oku:

- Domain exception + merkezi error code (magic string yok)
- Transaction + audit kaydı (mutating domain)
- FE: yasaklı API kullanımı yok (`localStorage`, `dangerouslySetInnerHTML` vb. — rule'da ne yazıyorsa)
- Worker/job pattern (faz kapsıyorsa)

Sapma → `PATTERN` MEDIUM.

---

## D11 — Roadmap deliverable

`Docs/10` §Faz N:

- Deliverable listesi vs D1/D3/D4 birleşik sonuç
- Human Gate maddeleri — controller **işaretlemez**, "hazır/değil" notu düşer
- Bilinen risk tablosu varsa ekstra grep

---

## D12 — UAT hazırlık

`Docs/11_UAT.md` §Faz N maddeleri:

- Bulgu ile cross-ref (F-XX-NNN ↔ UAT ID)
- Controller UAT dosyasını **güncellemez**
- İlgili faz öncesi UAT maddeleri ➖ N/A notu

---

## Faz tipine göre minimum boyut seti

| Faz tipi | Zorunlu boyutlar |
| -------- | ---------------- |
| Scaffold / infra | D1, D8, D9, D11 |
| Backend API | D1–D3, D6–D9, D11 |
| Frontend ekran | D1, D2, D4, D8, D9, D11 |
| Full-stack | D1–D11 (D12 opsiyonel) |
| Admin / onay akışı | D1–D11 + maker-checker D6/D7 |
| Security hardening | D6, D7, D9, D11, D12 |
| Performans | D9, D11 (+ D5 index defer notu) |

---

## Kanıt kalite seviyesi

| Seviye | Açıklama | Kabul |
| ------ | -------- | ----- |
| A | `path:satır` + spec § referansı | ✅ Tercih |
| B | Grep sayısı + dosya listesi | ✅ |
| C | "modül mevcut" genel ifade | ❌ Yetersiz |

Bulgu C seviyesindeyse **yazma** — daha fazla araştır.
