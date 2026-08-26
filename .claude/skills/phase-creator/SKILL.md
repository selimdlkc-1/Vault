---
name: phase-creator
description: Plans and writes implementation-phase skills for a project — researches the roadmap and code gaps, updates Docs/ as the single source of truth, then generates .claude/skills/phase-XX-<slug>/ skills whose iterations are plan-mode quality: per-chat scope, Docs section pointers, file inventory, spec-to-code mapping, quality gates and runnable stop commands. Use when the user says phase-creator, "yeni faz planla", "faz dokümanı üret", "faz skill'i yaz", "roadmap dilimi", "iterasyonları detaylandır", or wants an existing phase's iterations deepened. Do NOT use for: designing the core rule/skill architecture (rules-architect), auditing an already-implemented phase (phase-controller), writing the Docs/ set from scratch (project-doc-architect), or actually implementing a phase's code — this skill produces the plan, not the implementation.
---

# Phase Creator

> **Önkoşul:** Çekirdek talimat mimarisi (`.claude/rules/` + `CLAUDE.md`) yoksa önce **`rules-architect`**.
> **Implementasyon sonrası:** **`phase-controller`** — gap audit (kod değiştirmez).

Araştır → tek soru → taslak + docs planı → onay → **`Docs/` güncelle** → **faz skill'i yaz** (plan-modu kalitesinde iterasyonlar).

## Hedef çıktı

5+ iterasyonlu fazlarda **iterasyonları ayrı dosyalara böl** — tek `SKILL.md` 500 satırı geçerse agent'ın context'i her faz çağrısında şişer:

```
<proje>/.claude/skills/phase-01-backend-core/
├── SKILL.md                      # Faz üstü + iterasyon indeksi (≤200 satır)
└── iterations/
    ├── 01-app-skeleton.md
    ├── 02-security-utils.md
    └── 03-auth-endpoints.md       # agent yalnızca çalıştığı iterasyonu okur
```

4 ve altı iterasyonda tek `SKILL.md` yeterli.

**Klasör adı kontrolü:** Repo `Docs/` mi `docs/` mi kullanıyor — `Glob` ile doğrula, mevcut yazımı koru. Bu dosyalarda `Docs/` yazıyor; repo `docs/` kullanıyorsa tüm referansları ona göre yaz.

## Zorunlu kurallar

1. **Tek soru:** Tur başına bir soru; anket yasak.
2. **Onay kapısı:** Onaysız `Docs/` veya skill dosyası yazma.
3. **Docs önce:** Onay → `(A) Docs/` → `(B) faz skill'i`. Skill güncel `Docs/` referanslarına dayanır.
4. **Tek doğruluk kaynağı:** Spec `Docs/` içinde; skill kopyalamaz — `Docs/<dosya>.md` §bölüm + uygulama notu. Harita: bu klasördeki `docs-map.md` dosyasını oku.
5. **Araştırma önce:** Roadmap, `Docs/`, komşu faz skill'i, kod boşluğu.
6. **Uygulama-hazır iterasyonlar:** Her iterasyon `iteration-blueprint.md` iskeletinin **tamamını** içerir; geliştirici agent Plan moduna ihtiyaç duymadan kod yazar.
7. **Context window:** 1 chat ≈ 1 PR; ≤12 dosya; iterasyon başına Docs okuma ≤5 dosya (belirli §). Aşılıyorsa böl.
8. **MVP disiplini:** Kapsam dışı roadmap Wave'i faza ekleme.
9. **Feature branch:** Her faz skill'inde `## Feature branch (zorunlu)`; `git-phase-branch` skill'i; main'de faz kodu yok.

## Akış

```
[1 Araştırma] → [2 Soru] → [3 Taslak + docs planı + iterasyon grain] → [4 Onay]
  → [5 Docs/ güncelle] → [6 Özet] → [7 Faz skill'i yaz] → [8 Doğrulama]
```

---

## Adım 1 — Araştırma

| Kaynak | Ne için |
| ------ | ------- |
| `Docs/10_IMPLEMENTATION_ROADMAP.md` | Faz no, §N.M alt maddeler, bağımlılık |
| `.claude/skills/phase-*/SKILL.md` | Komşu faz tonu ve detay seviyesi |
| `.claude/rules/*.md` | Geçerli convention, kalite eşikleri, güvenlik checklist |
| `Docs/01`–`08`, `06_SCREEN_CATALOG` | Spec bölümleri (pointer için § numarası) |
| `Grep` / `Glob` | Kod vs doc boşluğu |

Çıktı: bulgular + **ilk tek soru**.

---

## Adım 2 — Soru döngüsü

```markdown
**Anladıklarım:** …
**Öneri (varsa):** …
**Soru:** …?
```

Sıra: Goal → katman → bağımlılık → **iterasyon grain (chat başına iş)** → test/Done → risk → faz no.

Yeterlilik eşiği: Goal, katmanlar, iterasyon sayısı, **her iterasyonun tek cümlelik teslimi**, Done, Explicit Don'ts, etkilenecek `Docs/` dosyaları → Adım 3.

---

## Adım 3 — Taslak (onay öncesi)

`Docs/` ve skill **yazma**. Sun:

```markdown
## Önerilen faz taslağı

**Skill:** `.claude/skills/phase-XX-<slug>/`
**Yapı:** tek SKILL.md / SKILL.md + iterations/ (iterasyon sayısına göre)
**Description:** [Faz N] … — K iterasyon/chat (…)

### Goal
…

### İterasyon özeti (grain)
| # | Teslim (1 cümle) | ~Dosya | Docs § |
| --- | --- | --- | --- |
| 1 | … | 4–8 | `Docs/10` §N.1, `Docs/02` … |

### MVP dışı / Done / Planlanan Docs güncellemeleri
…

Bu taslağı onaylıyor musun? Onay → önce Docs/, sonra blueprint kalitesinde faz skill'i.
```

İterasyon tablosunda **grain** zorunlu: agent'ın tek chat'te bitirebileceği teslim + yaklaşık dosya sayısı + hangi `Docs/` § okunacak.

---

## Adım 4 — `Docs/` güncellemesi

Onay sonrası yalnızca Docs; skill yok.

1. Bu klasördeki `docs-map.md` dosyasını oku — faz tipine göre minimum set.
2. Taslak tablosunu checklist gibi işle; her dosyayı `Read` + `Grep` ile doğru bölümden güncelle.
3. `Docs/10`: `### Faz N` + §N.1…N.K alt maddeleri (skill iterasyonlarıyla birebir hizalı).
4. Tutarlılık: enum / route / `S-*` üçlüsü (`02`/`03`/`06`); MVP `Docs/00` uyumu.

Özet + "faz skill'ine devam?" onayı → Adım 5.

---

## Adım 5 — Faz skill'i yazımı

Üst iskelet için bu klasördeki `reference.md`, her iterasyon için `iteration-blueprint.md` dosyasını oku.

### Frontmatter

```yaml
---
name: phase-01-backend-core
description: '[Faz 1] Backend core — 8 iterasyon/chat (app iskeleti → security util → auth endpoints → user CRUD → audit → seed). Use when the user says "Faz 1", "Faz 1 — İterasyon N", or asks to implement backend core, auth endpoints or the user module. Do NOT use for collectors (Faz 2) or frontend (Faz 6).'
---
```

- `name` = klasör adı, küçük harf + tire, ≤64 karakter, `phase-XX-<slug>` kalıbı.
- `description`: `[Faz N]` + iterasyon sayısı + zincir özeti + **tetikleyici cümleler** + **hangi faz için DEĞİL**. Kullanıcı "Faz N — İterasyon M" yazdığında bu skill tetiklenmeli.
- Başka frontmatter alanı yok (`globs`, `alwaysApply`, `description`-dışı Cursor alanları geçersiz).

### Her iterasyon zorunlu bölümler

| Bölüm | Amaç |
| ----- | ---- |
| Hedef | Ölçülebilir teslim |
| Teslim çıktısı | Somut artefaktlar |
| Önkoşullar | Önceki Stop + migration/env |
| Docs okuma sırası | ≤5 dosya, § + neden |
| Uygulama planı | Plan-modu adımları; fiil + path + Docs § |
| Dosya kapsamı | Oluştur / Güncelle / Dokunma tablosu |
| Spec → kod eşlemesi | ≥3 satır (scaffold istisnası belgeli) |
| Kalite kapıları | Test + deny + lint/type/test komutu |
| Bu iterasyonda yok | Scope duvarı |
| Risk / dikkat | Edge case, sızıntı uyarısı |
| Stop | Çalıştırılabilir komutlar |

### Yazım adımları

1. `Glob .claude/skills/phase-*/SKILL.md` — ad çakışması yok.
2. `Docs/10` §N.M ↔ `İterasyon M` birebir.
3. Her uygulama planı maddesi en az bir `Docs/…` § referansı taşır.
4. İterasyonlar ayrı dosyadaysa `SKILL.md`'de indeks tablosu + açık talimat: `iterations/03-auth-endpoints.md` dosyasını oku — diğerlerini okuma.
5. Faz üstü bölümler: Goal, Feature branch, çalışma modeli ("Plan moduna geçme — iterasyon yeterli"), Required Context, Done Definition, Explicit Don'ts.
6. **Yasak:** Belirsiz "API spec'e bak"; tam request body kopyası; 50+ satır dosya ağacı; tek iterasyonda çok katman.

Çıktı: skill yolu, iterasyon sayısı, kullanıcıya ilk çağrı etiketi (`Faz N — İterasyon 1`).

---

## Adım 6 — Doğrulama

**Docs/**

- [ ] Taslak + docs-map uygulandı
- [ ] `Docs/10` §N.M ↔ iterasyon sayısı uyumlu

**Faz skill'i**

- [ ] Frontmatter yalnızca `name` + `description`; `name` = klasör adı
- [ ] Description tetikleyici cümle + dışlama içeriyor
- [ ] `SKILL.md` ≤500 satır; aşıyorsa `iterations/` bölünmüş ve indekslenmiş
- [ ] Her iterasyon: blueprint'in 11 bölümü dolu
- [ ] Docs okuma sırası: path + §; ≤5 dosya/iterasyon
- [ ] Uygulama planı ≥3 somut adım; Spec→kod ≥3 satır (veya scaffold notu)
- [ ] Stop'ta çalıştırılabilir komut
- [ ] Plan modu tekrarı gerektirmiyor (kör nokta yok)
- [ ] Feature branch + 1 chat ≈ 1 PR
- [ ] `CLAUDE.md` faz tablosuna satır eklendi

---

## Ek kaynaklar

Gerektiğinde `Read` ile aç (bu skill klasöründe):

- `iteration-blueprint.md` — iterasyon şablonu, tam örnek, bölme kuralları
- `reference.md` — faz skill iskeleti, adlandırma, iyi/kötü iterasyon
- `docs-map.md` — `Docs/` güncelleme haritası, faz tipine göre minimum set

Ayrıca: `Docs/10_IMPLEMENTATION_ROADMAP.md` doküman yaşam döngüsü bölümü.

## Anti-pattern'ler

- ❌ Kısa iterasyon (yalnızca Hedef + Stop)
- ❌ Plan modunu iterasyona deleg etmek ("implementasyonda planla")
- ❌ Tüm `Docs/` okutma — yalnızca okuma sırasındaki §
- ❌ Spec tablosunu skill'e kopyalama
- ❌ Onaysız yazım; skill'i Docs'tan önce yazma
- ❌ Uydurma `S-*` / § / endpoint
- ❌ 9 iterasyonu tek `SKILL.md`'ye tıkmak
- ❌ Frontmatter'a `globs` / `alwaysApply` yazmak
