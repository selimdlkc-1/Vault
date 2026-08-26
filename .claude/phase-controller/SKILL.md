---
name: phase-controller
description: Read-only compliance audit of a completed roadmap phase against Docs/ and the phase skill — Done Definition, iteration goals, API contracts, screen catalog, DB schema, security baseline, tests, scope creep. Produces a .claude/skills/phase-XX-<slug>-fix/ remediation skill with the findings embedded; never modifies application code, tests, Docs/ or the source phase skill, and never writes Docs/fix-reports/ unless the user explicitly asks. Use after a phase implementation is finished, before a Human Gate, or when the user says phase-controller, "faz audit", "gap analizi", "faz kontrolü", "uyumluluk denetimi". Do NOT use for: planning a new phase (phase-creator), designing the rule/skill architecture (rules-architect), running the fix iterations themselves (the fix skill drives those), or repairing code — this skill diagnoses and plans only.
---

# Phase Controller

> **Eş skill:** `phase-creator` (plan → kod). **Bu skill:** kod → gap analizi → fix planı. Kod **değiştirilmez**.

Faz implementasyonu bittikten sonra **read-only compliance audit** çalıştırır.

## Varsayılan çıktı (tek artefakt)

**Yalnızca:** `.claude/skills/phase-XX-<slug>-fix/SKILL.md` — remediation planı + gömülü audit bulguları (tek kaynak).

```
.claude/skills/phase-09-admin-fix/
└── SKILL.md          # Audit bulguları + fix iterasyonları
```

Fix oturumları bu skill ile yürütülür (`Faz 9 — Fix İterasyon 1`). `phase-controller` fix sırasında **tekrar çalıştırılmaz**; regression audit ayrı oturumdur.

5+ fix iterasyonu çıkarsa `iterations/MM-<slug>.md` altına böl, `SKILL.md`'de indeks tablosu bırak — `phase-creator` ile aynı kural.

## Docs/fix-reports/ — yasak teklif

- ❌ `Docs/fix-reports/Faz-XX-<slug>-fix-report.md` **teklif etme**, onay şablonuna **ekleme**, varsayılan olarak **yazma**
- ❌ "Yazılacak dosyalar" listesinde `Docs/fix-reports/` gösterme
- ✅ Audit özeti sohbette sunulur; kalıcı artefakt fix skill'indeki **Audit bulguları** tablosu
- ✅ Kullanıcı **açıkça** "fix report Docs'a yaz" derse → istisna olarak oluşturulabilir

## Zorunlu kurallar

1. **Read-only:** Uygulama kodu, test, şema, `Docs/`, kaynak faz skill'i ve `.claude/rules/` **değiştirilmez**. CI komutları çalıştırılabilir; fail **düzeltilmez**, bulgu olarak yazılır.
2. **Kanıt zorunlu:** Her bulgu en az bir kanıt: `path:satır`, grep çıktısı özeti, veya `Docs/XX` §Y ↔ kod karşılaştırması.
3. **Tek soru kuralı:** Keşif turunda tur başına **bir** soru (faz no, branch, kapsam daraltma).
4. **Onay kapısı:** Fix skill **taslağı** (sohbet özeti + bulgu listesi) sunulur; onay olmadan dosya yazılmaz.
5. **Severity disiplini:** BLOCKER → HIGH → MEDIUM → LOW → INFO. BLOCKER = Human Gate fail / güvenlik ihlali / kritik Done maddesi eksik.
6. **Bulgu tipi:** `MISSING` | `WRONG` | `EXTRA` | `DOC_DRIFT` | `TEST_GAP` | `SECURITY` | `PATTERN`.
7. **Spec kaynağı:** `Docs/` + kaynak faz skill'i (Done Definition, Explicit Don'ts, Scope) + `.claude/rules/`. Çelişki → Docs kazanır; bulgu `DOC_DRIFT` veya `WRONG` etiketlenir.
8. **Fix scope sınırı:** Fix skill'i yalnızca audit bulgularını kapatır; yeni feature / sonraki faz scope'u **yasak**.

## Akış

```
[1 Araştırma] → [2 Tek soru] → [3 Read-only audit] → [4 Bulgu sınıflandırma]
  → [5 Taslak] → [6 Onay] → [7 Fix skill yazımı] → [8 Kapanış özeti]
```

Detay matris: bu klasördeki `verification-matrix.md`. Şablonlar: `reference.md`.

---

## Adım 1 — Araştırma

| Kaynak | Ne için |
| ------ | ------- |
| `.claude/skills/phase-XX-<slug>/SKILL.md` (+ `iterations/`) | Done Definition, iterasyonlar, Scope, Explicit Don'ts |
| `Docs/10_IMPLEMENTATION_ROADMAP.md` | §Faz N deliverable, Human Gate, bağımlılık |
| `Docs/02`, `03`, `06`, `07`, `08` | Şema, contract, ekran, güvenlik, test |
| `Docs/11_UAT.md` | §Faz N (varsa) — UAT maddeleri audit notu |
| `.claude/rules/03-security-baseline.md`, `04-quality-gates.md` | Baseline kontroller ve eşikler |
| `git log` / `git diff main...HEAD` | Faz branch kapsamı (opsiyonel) |
| `Grep`, `Glob` | Kod varlığı, pattern taraması |

**Faz eşleme:** `phase-09-admin` → fix skill `phase-09-admin-fix` (aynı `XX` + `<slug>`).

Çıktı: kısa bulgu hipotezleri + **tek soru**.

---

## Adım 2 — Tek soru

```markdown
**Anladıklarım:** Faz 9 admin branch'inde audit isteniyor; kaynak `phase-09-admin` skill'i.
**Soru:** Audit kapsamı tam faz mı, yoksa belirli iterasyon(lar) mı (örn. yalnızca İterasyon 7–10)?
```

Tam faz = Done Definition + tüm iterasyon hedefleri + Explicit Don'ts + scope creep.

---

## Adım 3 — Read-only audit

`verification-matrix.md` boyutlarını sırayla uygula. Her boyut için:

1. Beklenen durumu spec'ten çıkar (checkbox / madde listesi)
2. Kodda kanıt ara
3. Sonuç: ✅ uyumlu | ⚠ bulgu | ➖ N/A (Explicit Don'ts veya "Bu iterasyonda yok")

**Read-only komutlar** (fail = bulgu, fix yok). Komutları `Docs/09_DEV_WORKFLOW.md`, `.claude/rules/04-quality-gates.md` veya `package.json`/`Makefile`'dan al — uydurma:

```bash
<lint komutu>
<type check komutu>
<faz kapsamındaki test komutu>
```

Tam test suite yalnızca Done Definition gerektiriyorsa. Coverage script varsa çalıştır; eşik altı → `TEST_GAP`.

**Yasak:** kod/test/spec dosyası düzenleme, migration, commit, PR. **Tek istisna:** onay sonrası `.claude/skills/phase-XX-<slug>-fix/` altına yazmak.

---

## Adım 4 — Bulgu sınıflandırma

Her bulguya benzersiz ID: `F-<XX>-<NNN>` (ör. `F-09-001`).

| Severity | Ne zaman |
| -------- | -------- |
| **BLOCKER** | Güvenlik baseline ihlali; kritik API/ekran yok; Explicit Don'ts ihlali; CI kırmızı |
| **HIGH** | Done Definition maddesi eksik/hatalı; negatif deny test yok; kontrol backend'de enforce edilmemiş |
| **MEDIUM** | Pattern sapması (tek endpoint'te guard eksik); kısmi implementasyon |
| **LOW** | İsimlendirme, doc güncellenmemiş, düşük risk test eksikliği |
| **INFO** | Gözlem, bilinçli erteleme kanıtı ("Bu iterasyonda yok" uyumlu) |

**Genel durum:**

| Durum | Koşul |
| ----- | ----- |
| `PASS` | BLOCKER=0, HIGH=0 |
| `PASS_WITH_GAPS` | BLOCKER=0, HIGH>0 veya MEDIUM≥3 |
| `FAIL` | BLOCKER≥1 |

---

## Adım 5 — Taslak (onay öncesi)

Dosya **yazma**. Sohbette özet:

```markdown
## Phase Controller — Faz N Audit Özeti

**Genel durum:** PASS | PASS_WITH_GAPS | FAIL
**Kaynak:** `.claude/skills/phase-XX-<slug>/`
**Branch:** …

| Severity | Adet |
| -------- | ---- |
| BLOCKER  | …    |
| HIGH     | …    |

**Fix iterasyon özeti:** (kaç iterasyon, gruplama mantığı)

**Onay sonrası yazılacak:**
- `.claude/skills/phase-XX-<slug>-fix/SKILL.md` (bulgular bu dosyaya gömülür)

Bu taslağı onaylıyor musun?
```

`Docs/fix-reports/` path'ini bu şablonda **gösterme**.

---

## Adım 6 — Onay sonrası yazım

1. Fix skill'i — iskelet için `reference.md` dosyasını oku; **Audit bulguları** bölümü tüm `F-XX-NNN` kayıtlarını içerir.
2. Frontmatter yalnızca `name` + `description`; `name` = klasör adı (`phase-09-admin-fix`).
3. Description tetikleyicisi: `Use when the user says "Faz N — Fix İterasyon M"` + kaynak faz dışlaması.
4. `Docs/fix-reports/` **oluşturma** — kullanıcı açıkça istemedikçe.
5. `CLAUDE.md` faz tablosuna fix satırı ekle (varsa).

**Fix iterasyon gruplama:** BLOCKER+SECURITY önce → HIGH → MEDIUM/LOW. Domain sırası: şema/BE → FE → test. Her bulgu ID bir iterasyona map edilir.

---

## Adım 7 — Kapanış özeti

```markdown
## Phase Controller tamamlandı

| Çıktı | Path |
| ----- | ---- |
| Fix planı | `.claude/skills/phase-XX-<slug>-fix/SKILL.md` |

**Genel durum:** …
**Sonraki adım:** Yeni sohbette 「Faz N — Fix İterasyon 1」 yaz. Human Gate öncesi BLOCKER=0 hedeflenir.
```

---

## Ekosistem ilişkileri

| Bileşen | İlişki |
| ------- | ------ |
| `phase-creator` | Faz **öncesi** plan; controller **sonrası** doğrulama |
| `rules-architect` | Baseline kuralları üretir; controller onlara karşı denetler |
| `git-phase-branch` | Fix oturumları aynı faz branch veya `fix/F<N>-*` — fix skill'inde belirtilir |
| `Docs/11_UAT.md` | Controller otomatik UAT işaretlemez; fix skill'i UAT maddelerine referans verebilir |
| Human Gate | Controller Human Gate'i **tamamlamaz**; girdi sağlar |

**Regression:** Fix iterasyonları bittikten sonra controller tekrar çalıştırılabilir; fix skill'i güncellenir veya `-v2` suffix'li yeni klasör açılır — kullanıcıya sor.

---

## Anti-pattern'ler

- ❌ `Docs/fix-reports/` teklif etmek veya varsayılan çıktı olarak listelemek
- ❌ Audit sırasında kod veya test düzeltmek
- ❌ Kanıtsız bulgu ("galiba eksik")
- ❌ Fix skill'ine yeni feature / sonraki faz scope'u koymak
- ❌ Kaynak faz skill'ini, `.claude/rules/` veya `Docs/` dosyalarını audit sırasında değiştirmek
- ❌ Roadmap'te fazı "tamamlandı" işaretlemek
- ❌ Tek mesajda çoklu soru
- ❌ Onaysız fix skill'i yazmak
- ❌ Fix oturumu sırasında controller'ı tekrar çalıştırmak

## Ek kaynaklar

Gerektiğinde `Read` ile aç:

- `reference.md` (bu klasör) — fix skill iskeleti + isteğe bağlı Docs rapor şablonu
- `verification-matrix.md` (bu klasör) — boyut × kanıt matrisi
- `~/.claude/skills/phase-creator/reference.md` — kaynak faz skill yapısı
- `~/.claude/skills/phase-creator/docs-map.md` — hangi doc ne zaman
