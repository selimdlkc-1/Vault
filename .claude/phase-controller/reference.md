# Phase Controller — Referans Şablonları

Fix skill iskeleti (varsayılan tek çıktı). Spec detayı **kopyalanmaz** — path + bölüm referansı.

> **Varsayılan:** Yalnızca `.claude/skills/phase-XX-<slug>-fix/`. `Docs/fix-reports/` **teklif etme**; kullanıcı açıkça istemedikçe yazma.

---

## Adlandırma

| Artefakt | Path | Örnek | Varsayılan |
| -------- | ---- | ----- | ---------- |
| Fix planı | `.claude/skills/phase-XX-<slug>-fix/SKILL.md` | `.claude/skills/phase-09-admin-fix/SKILL.md` | ✅ Evet |
| Fix iterasyonları (5+) | `iterations/MM-<slug>.md` | `iterations/01-blocker-security.md` | Duruma göre |
| Fix raporu (opsiyonel) | `Docs/fix-reports/Faz-XX-<slug>-fix-report.md` | — | ❌ Açık istek gerekir |

- `XX`: roadmap faz numarası (sıfır dolgulu: `09`)
- `<slug>`: kaynak faz skill'inden (`admin`, `case-workflow`)
- `name` frontmatter = klasör adı, ≤64 karakter

---

## Fix skill şablonu

Kaynak: `~/.claude/skills/phase-creator/reference.md` iskeleti — remediation odaklı adaptasyon.

````markdown
---
name: phase-09-admin-fix
description: '[Faz 9 Fix] Admin modülü gap remediation — 3 fix iterasyon/chat (BLOCKER+security → HIGH backend → test gap). Use when the user says "Faz 9 — Fix İterasyon M", asks to close Faz 9 audit findings, or references F-09-NNN. Do NOT use for new Faz 9 features or for Faz 10 scope. Audit: phase-controller YYYY-MM-DD.'
---

# Faz 9 Fix: Admin Modülü

## Goal

Aşağıdaki **Audit bulguları** bölümündeki gap'leri kapat. BLOCKER=0, HIGH=0 hedeflenir; MEDIUM/LOW fix iterasyonlarına veya bilinçli defer'e ayrılır. **Yeni feature yok** — yalnızca gap kapatma.

**Kaynak faz:** `.claude/skills/phase-09-admin/`
**Audit durumu:** PASS_WITH_GAPS (YYYY-MM-DD)

## Feature branch (fix)

**Önerilen branch:** `fix/F9-admin` veya mevcut `feature/F9-admin` (`git-phase-branch` skill'i).

**Stop (Fix İterasyon 1, kod öncesi):** [ ] Audit bulguları okundu; [ ] BLOCKER listesi net; [ ] branch checkout.

## Bu fix'in çalışma modeli

Tek sohbette tüm fix'ler tamamlanmayabilir. Her session başında **「Faz 9 — Fix İterasyon M」** belirt. Agent yalnızca o iterasyonun bulgularını ve listelenen `Docs/` bölümlerini okur.

---

## Audit bulguları (tek kaynak)

| ID | Severity | Tip | Başlık | Kanıt |
| --- | --- | --- | --- | --- |
| F-09-001 | BLOCKER | SECURITY | … | `path:satır` veya spec § |
| F-09-002 | HIGH | MISSING | … | … |

**Explicit Don'ts kontrolü:** ✅/❌ özet

---

### Fix İterasyon 1 — BLOCKER / Security

**Hedef:** F-09-001, F-09-002 kapat.

**Yapılacaklar:**
1. … (audit bulgusundaki önerilen aksiyondan)
2. …

**Kapatılacak bulgular:** F-09-001, F-09-002

**Minimum bağlam:**
- Bu dosya §Audit bulguları (F-09-001, F-09-002)
- `Docs/03_API_CONTRACTS.md` §…
- `.claude/rules/03-security-baseline.md` (zaten yüklü — yalnızca ilgili madde)

**Bu fix iterasyonda yok:** FE polish, sonraki faz scope.

**Stop:** [ ] F-09-001, F-09-002 kanıtlandı; [ ] ilgili test yeşil; PR/onay → Fix İterasyon 2.

---

### Fix İterasyon 2 — HIGH / Backend

(tekrar)

---

## Required Context

- Bu dosya §Audit bulguları — tüm F-09-NNN
- `.claude/skills/phase-09-admin/SKILL.md` — orijinal Done Definition
- Bulgularda listelenen `Docs/` bölümleri

## Fix Done Definition

| Bulgu ID | Severity | Kapatıldı |
| -------- | -------- | --------- |
| F-09-001 | BLOCKER | [ ] |
| F-09-002 | HIGH | [ ] |

### Kalite kapıları

- [ ] Lint + type check yeşil
- [ ] Orijinal faz Done Definition maddeleri spot-check
- [ ] BLOCKER = 0
- [ ] Regression audit (`phase-controller`) veya developer onayı

## Explicit Don'ts

- Yeni feature / sonraki faz deliverable ekleme
- Bulguyu kanıtsız "kapatıldı" işaretleme
- Orijinal faz scope'unu genişletme
- Spec'i koda uydurmak (spec doğruysa kod fix; spec yanlışsa ADR/docs ayrı oturum)

## Deferred (bilinçli erteleme)

| Bulgu ID | Gerekçe | Hedef |
| -------- | ------- | ----- |
| F-09-010 | LOW — Faz 10 scope | Faz 10 |

---
Fix done → `phase-controller` regression audit → Human Gate.
````

---

## Bulgu ID ↔ Fix iterasyon eşleme kuralları

1. Her BLOCKER ayrı ya da tek "Fix İterasyon 1 — BLOCKER" grubunda
2. Aynı dosya/modüldeki HIGH bulguları bir iterasyonda topla (1 chat ≈ 1 PR)
3. LOW/INFO → `Deferred` tablosu veya son fix iterasyonu
4. Fix Done Definition tablosu **tüm** BLOCKER+HIGH bulgularını içermeli

---

## İyi vs kötü bulgu yazımı

**İyi:**

```markdown
### F-09-003 [HIGH][TEST_GAP] Admin audit viewer field masking testi yok

**Beklenen:** Done Definition — audit viewer'da plaintext hassas alan yok
**Gözlemlenen:** Integration test dosyası yok
**Kanıt:** `Glob **/audit-viewer*.spec.ts` — 0 dosya; `Docs/06` S-ADMIN-AUDIT-VIEWER
**Fix iterasyonu:** Fix İterasyon 3
**Önerilen aksiyon:** …
```

**Kötü:**

```markdown
### Eksik testler var

Admin testleri yetersiz olabilir.
```

---

## Fix Report şablonu (opsiyonel)

Yalnızca kullanıcı `Docs/fix-reports/` çıktısı **açıkça** istediğinde. Varsayılan akışta bulgular fix skill'inin **Audit bulguları** bölümüne gömülür.

```markdown
# Faz XX Fix Raporu — <Başlık>

> **Tarih:** YYYY-MM-DD
> **Auditor:** phase-controller skill
> **Branch:** `<branch-adı>`
> **Kaynak faz skill'i:** `.claude/skills/phase-XX-<slug>/`
> **Genel durum:** PASS | PASS_WITH_GAPS | FAIL

## 1. Executive Summary

| Metrik | Değer |
| ------ | ----- |
| BLOCKER / HIGH / MEDIUM / LOW / INFO | 0 / 0 / 0 / 0 / 0 |
| Done Definition (uyumlu / toplam) | 0 / 0 |

**Özet:** 2–4 cümle — en kritik gap'ler
**Human Gate hazır mı?** Evet / Hayır — gerekçe

## 2. Audit Kapsamı

**Dahil:** Done Definition, Explicit Don'ts, Scope + "Dokunma" ihlali, `Docs/10` §Faz XX deliverable, faz tipine göre docs-map minimum set
**Hariç:** Sonraki faz deliverable'ları, …

| Read-only komut | Sonuç |
| --------------- | ----- |
| `<lint>` | ✅ / ❌ |
| `<typecheck>` | ✅ / ❌ |

## 3. Done Definition Matrisi

| # | Madde (kaynak) | Durum | Bulgu ID |
| - | -------------- | ----- | -------- |
| 1 | … | ✅ / ❌ / ➖ | F-XX-001 |

## 4. Bulgular

### F-XX-001 [BLOCKER][MISSING] <kısa başlık>

**Boyut:** API Contract
**Beklenen:** `Docs/03_API_CONTRACTS.md` §8.10 — …
**Gözlemlenen:** …
**Kanıt:** `Grep '<desen>'` — 0 eşleşme
**Fix iterasyonu:** Fix İterasyon 1
**Önerilen aksiyon:** …

## 5. Explicit Don'ts Kontrolü

| Don't (kaynak faz) | Durum | Bulgu ID |

## 6. Scope Creep (EXTRA)

| Dosya / alan | Neden faz dışı | Bulgu ID |

## 7. UAT / Human Gate Notları

`Docs/11_UAT.md` §Faz XX — otomatik işaretlenmez.

| UAT ID | İlgili bulgu | Not |

## 8. Sonraki Adımlar

1. 「Faz XX — Fix İterasyon 1」
2. BLOCKER kapat → regression audit (opsiyonel)
3. Human Gate

---
_Rapor phase-controller skill ile üretilmiştir; uygulama kodu değiştirilmemiştir._
```
