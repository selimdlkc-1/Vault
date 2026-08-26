---
name: docs-architect
description: Transforms an existing architecture-decisions file (mimari-kararlar.md, architecture-decisions.md, consolidated ADRs) into a self-contained, agent-ready set of 11 documents under docs/ — project overview, domain model, database schema, API contracts, backend spec, frontend spec, screen catalog, security implementation, testing strategy, dev workflow, implementation roadmap. Use when a decisions file exists and the user wants the technical docs a coding agent will consume before implementation. Trigger on "proje dokümantasyonu üret", "mimari kararlardan doküman oluştur", "agent-ready dokümantasyon", "docs setini hazırla", "prepare docs before coding", "kaldığım yerden devam et" during a doc run. Do NOT use for: building the decisions file itself (decisions-architect), writing .claude/rules or CLAUDE.md (rules-architect), phase planning (phase-creator), or a one-off README/API reference — this skill's input is a decisions document, not a project idea.
---

# Docs Architect

Turns an architecture-decisions file into 11 self-contained documents under `docs/` that a coding agent reads during implementation. Output language follows the source decisions file (typically Turkish) with technical terms in English.

Stage 2 of a five-stage pipeline:

```
decisions-architect → docs-architect → rules-architect → phase-creator → phase-controller
 (mimari-kararlar.md)  (this skill:     (.claude/rules   (phase skills)   (audit + fix)
                        docs/00–10)      + CLAUDE.md)
```

Downstream stages treat `docs/` as the **single source of truth** and reference it by path + section. Write accordingly: sections must be stable and findable.

## Environment rules (Claude Code)

- **Output goes into the repo:** `docs/NN_FILENAME.md`. Check with `Glob` whether the repo uses `docs/` or `Docs/` and match it; create the directory if absent.
- **No file-presentation tool.** After writing each document, print its path and a 1–2 sentence summary. Never reprint the document content in chat.
- **Long documents are built in two steps.** `Write` the skeleton (headers + tables of contents + section stubs), then `Edit` section by section. A single `Write` call cannot carry a 30–80 page document, and retrying one wastes the whole attempt.
- **Do not read the decisions file whole if it is large.** See Faz A.1.
- **Do not add these documents to `CLAUDE.md` as `@` imports.** Imports load at session start; `rules-architect` will reference them by path instead.

## Core principles

**Self-contained documents.** No cross-document references ("bkz. [R-005]", "see 02_DATABASE_SCHEMA.md"). Each document states its rules in full. If a rule applies in two places, write it out fully in both — repetition is cheaper than a broken link for the consuming agent.

**Decision absorption, not copy-paste.** Read the decisions, understand the intent, rewrite in the form each document needs. `[R-005] Master data managed by Superadmin and User Manager` becomes, in `07_SECURITY_IMPLEMENTATION.md`: *"Master data write endpoints (POST/PUT on `/api/v1/master-data/*`) require SUPERADMIN or USER_MANAGER role; other authenticated users receive 403."* The intent is enforced, not quoted.

**No loose ends.** Every open item in the source (`[X-OPEN-N]`, TODO, "⚠️ açık karar", "karar bekleniyor") is resolved in Faz A by proposing a best-practice assumption and confirming with the user. Final documents contain no TODO markers, no "to be decided", no hedging. The assumption list is reported separately so the user can fold it back into the decisions file.

**Precision over volume.** 40 tight lines that fully answer beats 200 lines with filler. Every sentence either constrains the agent, informs a judgment it must make, or provides a reference pattern.

**Source file is input, not sibling.** The decisions file is never referenced from the generated docs. The user maintains it separately; generated docs stand alone.

**Section numbers are an API.** `rules-architect` and `phase-creator` point at `Docs/03 §2.1`. Number sections explicitly and don't renumber casually on regeneration.

---

## Input discovery

1. `Glob` for `docs/mimari-kararlar.md`, `mimari-kararlar*.md`, `architecture-decisions*.md`, `decisions*.md` at repo root and under `docs/`.
2. Also check `docs/adr/*.md` — consolidated ADRs count as a decisions source.
3. If nothing matches, ask for the path. Do not invent a project from a verbal description — that is `decisions-architect`'s job.

**Optional input:** ask once in Faz A whether existing partial docs (brand guide, earlier API spec) must be preserved.

---

## Workflow

Two phases: one ingestion turn-pair (Faz A), then a per-document loop (Faz B). Never skip Faz A. Never generate two Faz B documents in one turn.

### Faz A — Ingestion and assumption closure

**A.1 Build the inventory (no output yet).**

For a decisions file under ~800 lines, `Read` it fully. Above that, inventory it without a full read:

1. `Grep '^## '` — section list
2. `Grep '\*\*Karar \[' -A2` — decision statements with their first line of rationale
3. `Read` the Section 18 / open-items block and the version history in full
4. Read individual sections in full only when you reach the document that consumes them

Assemble:
- **Closed decisions** — ID + one-line statement
- **Open items** — `[KATEGORI-OPEN-N]` with priority tags
- **Gaps** — topics the 11-document set needs that the source never addresses
- **Contradictions** — any two decisions pulling opposite ways

**A.2 Faz A report (single message).**

```markdown
# Faz A — Girdi Sindirme Raporu

## Projeyi okudum
2–3 cümle: ne olduğu, ürün modeli, ölçek, dil.

Sayılar: N kapanmış karar · M açık karar/boşluk · K çelişki

## Çelişkiler (varsa)
Her biri: ne ile ne çelişiyor. Netleşmeden devam edilmez.

## Açık kararlar ve önerilen varsayımlar
### [Kısa başlık]
**Mevcut durum:** kaynakta ne yazıyor / hiç bahsedilmemiş
**Önerilen varsayım:** somut, uygulanabilir karar
**Gerekçe:** 1 cümle
**Etkilenecek dokümanlar:** liste

## Üretim planı
| # | Dosya | Ana içerik | Tahmini uzunluk | İlgili açık karar |
(11 satır)

## Onay istiyorum
1. Çelişkiler nasıl çözülsün?
2. Varsayımları toplu onaylıyor musun?
3. Korunacak mevcut doküman var mı?

Hazır olunca "Faz B başlat" de.
```

Wait for the answer. Absorb corrections silently with a short acknowledgment; do not re-emit the full report unless asked.

### Faz B — Per-document loop

For each document 00 → 10:

**B.1 Outline proposal (one message).**

```markdown
# docs/NN_FILENAME.md — Outline Önerisi

## Ana başlıklar
1. [Bölüm] — 1 cümle
2. …

## Bu dokümanda somutlaşacak kararlar
Hangi kaynak kararlar buraya çevriliyor, hangi Faz A varsayımı geçerli.

## Eklenecek diagram'lar
Mermaid tipi + amaç, veya "yok".

## Tespit edilen özel durumlar
Onay isteyen yargı çağrıları.

Onaylıyor musun?
```

**B.2 Wait for feedback.** Absorb quietly. Don't re-ask.

**B.3 Generate.** Read this document's spec in `references/document-specs.md` **first**. Then:

- ≤300 satır hedefli doküman: tek `Write`.
- Daha uzunsa: `Write` ile iskelet (başlıklar + numaralı bölüm stub'ları) → her bölüm için `Edit`.

Print the path and a 1–2 sentence summary. Do not paste the content.

**B.4 Next document.** Do not re-summarize completed documents and do not carry their content forward. Carry only the closed-decision inventory and the Faz A assumption list. This is deliberate context discipline — it is what makes an 11-document run finishable.

### Special case — 06_SCREEN_CATALOG

Structurally different; must be chunked.

**B.1-SC Screen inventory** before the normal outline:

```markdown
# 06_SCREEN_CATALOG.md — Ekran Envanteri

## Kararlardan çıkan ekranlar
| Ekran ID | Route | Layout | Kritik/İkincil | Dayanak |

## Skill'in eklediği ekranlar
404, 500, logout confirm, session expired, empty state — kararlarda yok ama gerekli.

## Üretim grupları
1. Auth grubu: S-LOGIN, S-PASSWORD-RESET, S-SESSION-EXPIRED
2. …

Grup grup üreteceğim; her grup sonrası feedback.
```

**B.3-SC Chunked generation.** First `Write`: header + screen map + navigation + layout section + first group. Then one `Edit` per group. After each group print the cumulative screen count and pause. Final pass adds the screen-flow Mermaid diagram and the common-components section.

### Completion

```markdown
# Üretim Tamamlandı

## Üretilen dokümanlar
Liste + path'ler.

## Faz A varsayımları (kayıt için)
Onaylanan liste — kullanıcı mimari-kararlar.md'ye geri işleyebilir.

## Kalan boşluklar (varsa)

## Sonraki adım
`rules-architect` çalıştır: docs/ üzerinden `.claude/rules/` + `CLAUDE.md` üretilir.
Kararlar değişirse mimari-kararlar.md güncellenir ve bu skill baştan çalıştırılır —
incremental update desteklenmez.
```

---

## Writing standards

| Konu | Kural |
| --- | --- |
| Dil | Kaynak dosyanın dilinde (tipik Türkçe). Teknik terimler İngilizce (endpoint, middleware, guard, migration) |
| Ton | Kural ifadeleri emir kipinde ("her endpoint … ile işaretlenir"); mimari tanımlar bildirim kipinde |
| Belirsizlik | Yasak. "Belki", "düşünülebilir", "mümkünse" yok. Her cümle bir karardır |
| Bölüm numarası | Her ana başlık numaralı (`## 2. Auth`) — downstream `§2` diye referans veriyor |
| Biçim | Açıklama prose; matris tablo (endpoint listesi, yetki matrisi, env vars); akış Mermaid |
| Zorunlu diagram | ERD (02), auth sequence (07), entity relationships (01), screen map (06), state machine (01, varsa) |
| Örnek | Her kritik pattern için bir referans snippet — galeri değil |
| Cross-doc link | Yasak. Her doküman kendi kendine yeter |
| Gerekçe | Yalnızca non-obvious kararlarda WHY ekle |
| Agent-safety | Her kural WHAT + HOW içerir; "hangi durumda ne?" sorusu bırakma |

## Anti-patterns

- ❌ "Bkz. [X-000]" tarzı kaynak atfı
- ❌ Belirsiz ifade ("uygun şekilde", "gerekirse")
- ❌ Final dokümanda TODO / "⚠️ açık" / "kararlaştırılacak"
- ❌ Aynı paragrafı iki dokümana kopyalamak (her doküman kendi bağlamında yeniden yazılır)
- ❌ Outline onayı olmadan full doküman üretmek
- ❌ Aktif dokümanı bitirmeden sonrakine geçmek
- ❌ Faz A'yı atlamak
- ❌ Screen Catalog'u tek hamlede üretmek
- ❌ Numarasız başlık (downstream referans veremez)
- ❌ 80 sayfalık dokümanı tek `Write` ile denemek
- ❌ Önceki dokümanları context'te taşımak

---

## Document set

| # | Dosya | Ana içerik | Tipik uzunluk |
| - | ----- | ---------- | ------------- |
| 00 | PROJECT_OVERVIEW | Amaç, kapsam, başarı kriterleri, kısıtlar | 2–4 sayfa |
| 01 | DOMAIN_MODEL | Entity'ler, ilişkiler, iş kuralları, state machine'ler | 8–15 |
| 02 | DATABASE_SCHEMA | Tablolar, alanlar, index'ler, ERD, migration | 15–30 |
| 03 | API_CONTRACTS | Endpoint'ler, error taxonomy, versioning, SLA | 30–80 |
| 04 | BACKEND_SPEC | Klasör, middleware, servis, repository, job, logging | 10–20 |
| 05 | FRONTEND_SPEC | Routing, state, form, fetch, a11y, Web Vitals | 8–15 |
| 06 | SCREEN_CATALOG | Ekran ekran detay (iki seviyeli) + ekran haritası | 30–80 |
| 07 | SECURITY_IMPLEMENTATION | Auth akış, token, izin, CORS/CSP, KVKK, rate limit, audit | 15–25 |
| 08 | TESTING_STRATEGY | Piramit, coverage, CI gate, factory, e2e | 5–10 |
| 09 | DEV_WORKFLOW | Git, commit, PR, env, local setup | 5–10 |
| 10 | IMPLEMENTATION_ROADMAP | Faz-bazlı yol haritası, agent session planı, human gate, risk, teknik borç | 20–60 |

Per-document required sections, mandatory diagrams and downstream consumers → `references/document-specs.md`. Read the current document's spec at the start of its Faz B iteration.

---

## Error modes

**User abandons mid-run.** Do not proceed to the next document. On return, `Glob docs/*.md` to see what exists, read only the Faz A assumption list if it was written down, and resume from the first missing document. Never regenerate completed ones.

**Outline rejected twice.** Ask one targeted clarification instead of guessing a third time.

**Source self-contradicts.** Do not pick a side silently. Raise it in Faz A under "Çelişkiler" and wait.

**Document exceeds its length target by 2×.** Stop and reassess — usually it means undigested source is being dumped. Offer to split or trim.

**Re-run with a newer decisions file.** Fresh generation; previous outputs are overwritten. No incremental merge. The user diffs with git if they want to see what changed.
