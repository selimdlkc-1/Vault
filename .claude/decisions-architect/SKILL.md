---
name: decisions-architect
description: Builds a project's docs/mimari-kararlar.md architecture-decisions document from scratch through guided, clustered dialogue — the ID-referenced single source of truth feeding project-doc-architect and rules-architect. Use at the START of a new software project, before any code exists, to capture scope, scale, auth, authorization, workflow, security/KVKK/GDPR, tech stack, infra, testing and agent coding rules as stable-ID, cross-referenced, approval-gated decisions. Trigger on "mimari kararlar dokümanı oluştur", "yeni proje için karar dokümanı", "mimari-kararlar.md hazırla", "vibe-coding öncesi karar dokümanı", "karar dokümanına devam et". Prefer it over free-form notes whenever the user starts a project and discusses scope, stack or rules, even without naming the file. Do NOT use for: turning an EXISTING decisions file into the docs set (project-doc-architect), writing .claude/rules or skills (rules-architect), planning phases (phase-creator), or logging a single ADR in an established project.
---

# Decisions Architect

Build `docs/mimari-kararlar.md` — the living, ID-referenced **single source of truth** every downstream document and rule will point back to. The goal is a document so granular and cross-referenced that a coding agent has zero room for interpretation drift.

Stage 1 of a five-stage pipeline:

```
decisions-architect → project-doc-architect → rules-architect → phase-creator → phase-controller
 (this skill:          (11 self-contained     (.claude/rules   (phase skills)   (audit + fix)
  mimari-kararlar.md)   docs/ files)           + CLAUDE.md)
```

Everything downstream inherits this document's quality, so precision beats speed here.

## Environment rules (Claude Code)

- **No interactive choice widget.** Ask clustered questions as numbered prose (`1a / 1b / 1c`) so the user can answer with a short list like "1b, 2a, 3 — bilmiyorum". Never one question at a time.
- **No file-presentation tool.** After writing, print the path and a one-line summary of what changed.
- **Output path:** `docs/mimari-kararlar.md`. Check with `Glob` whether the repo uses `docs/` or `Docs/` and match it; create the directory if absent.
- **Edit, don't rewrite.** After the first write, use `Edit` on the target section's placeholder or last decision. Rewriting a 60–100KB document per section burns context and risks losing earlier sections.
- **This document does not go into `CLAUDE.md` or `.claude/rules/`.** Those are produced later by `rules-architect` and reference this file by ID.

## Before you start — read these

1. `references/decision-protocol.md` — ID scheme, decision anatomy, ONAY vs ACTION-FIRST modes, open-item discipline, version history, language and terminology rules. **Read fully before writing any decision.**
2. `references/section-catalog.md` — the canonical 18-section skeleton: purpose, ID prefix, core/optional status, elicitation cluster, decision mode. **Read fully before the first elicitation round.**
3. `assets/mimari-kararlar-skeleton.md` — the empty scaffold to copy and fill.

## The core loop

### 0. Intake

One clustered round, minimum needed to frame the project:

- Proje adı + bir cümlelik ne olduğu
- Kabaca ölçek (kaç kullanıcı / eşzamanlı) ve coğrafya/regülasyon
- Ürün tipi: CRUD ağırlıklı mı, workflow ağırlıklı mı, dosya/doküman var mı, dış entegrasyon var mı, bildirim var mı — bu, hangi opsiyonel bölümlerin gerekeceğini belirler
- Çıkarılmasını istediği bölüm var mı

Then copy the skeleton to `docs/mimari-kararlar.md`, fill `{{PROJE_ADI}}` / `{{TARIH}}`, and confirm the section list (mark removed sections with the catalog's scope-out line — never delete silently).

### 1. Work section by section, in order (1 → 18)

For each section:

1. Pull its elicitation cluster and decision mode from `section-catalog.md`.
2. Ask the clustered questions as numbered prose. Generate follow-ups from the answers. Aim to close the section in 1–2 turns.
3. Write decisions following **decision anatomy** and the **ONAY vs ACTION-FIRST** split:
   - **ONAY** (architecture, security, business rules, scale, stack, integrations): explain the concept briefly if needed → present a recommendation with trade-offs → get approval → write with ID.
   - **ACTION-FIRST** (naming, commit format, folder layout): write a sensible default directly and say "şunu şöyle aldım, itiraz edersen düzeltirim".
   - Workflow (§6) state machines: always explain across **4 layers** — Anlamı / Backend / Data / UI.
   - Security (§10): every decision is ONAY, fix the target security level up front (e.g. OWASP ASVS L2 + KVKK), split into sub-rounds — it will be large.
4. Anything undecided → park in Section 18 as `[KATEGORI-OPEN-N]` with a 🔴/🟠/🟢 priority tag. Never invent. "Defer to team" is a valid resolution.
5. **Persist with `Edit`** targeting that section, then give a 2-line "kapanan / açık" summary before moving on.

### 2. Cross-reference pass

After the substantive sections, sweep for decisions that affect each other and add `[X-NNN]` cross-references **both ways**. Lock terminology (Turkish + English form, used consistently).

`Grep '\[[A-Z]+-[0-9]+\]' docs/mimari-kararlar.md` to list every ID; check each appears where it is referenced.

### 3. Finalize the session

- Update the version-history table: bump version, list IDs added and OPEN items closed/opened.
- Update the status line at the top.
- Print the file path and the "kapanan / açık" totals.
- Tell the user the next pipeline step: run `project-doc-architect` on this file.

## Session & resume management

The 18 sections rarely finish in one sitting. Expected.

- Persist after **every** section — a Claude Code session can end at any time and the file is the only carry-over.
- **On resume, do not read the whole document.** Read the version-history table and Section 18 first, then `Grep '^## '` for the section list, then read only the section you are about to work on. A finished decisions file is large; reading it whole every session wastes most of the context budget before the first question.
- Don't re-ask closed decisions. If the user contradicts a closed decision, write a **new** superseding decision — never rewrite history silently.
- Keep the document monolithic. It is the single source of truth and must not be split across files.

## Output conventions (non-negotiable)

- **Language:** Turkish prose + English code identifiers (hybrid). See `decision-protocol.md` §8.
- **Every decision** carries an immutable `[KATEGORI-SIRA]` ID, never reused.
- **Open items** live in Section 18 with priority tags; closed ones move to the version history.
- **Cross-references** by ID connect related decisions.
- The standing rule "Bu kararlar tamamlanmadan ilgili kod yazılmaz" appears in Section 18.
- Test/CI sections always include "agent kullanıcı onayı olmadan main'e merge etmez".

## Anti-patterns

- ❌ Inventing decisions the owner hasn't approved (especially in ONAY sections) — park as OPEN instead
- ❌ One-question-at-a-time interrogation — cluster
- ❌ Deleting a removed section silently — mark it scoped-out so downstream sees the boundary
- ❌ Writing decisions without IDs or rationale
- ❌ Reusing or renumbering IDs after they exist
- ❌ Splitting the document into multiple files
- ❌ Rewriting the whole file to add one decision
- ❌ Reading the entire document on resume
- ❌ Switching prose to English or identifiers to Turkish
- ❌ Copying decisions into `CLAUDE.md` or `.claude/rules/` — that is `rules-architect`'s job, and it references by ID

## Worked micro-example

ONAY decision, written after trade-offs were presented and approved:

```
**Karar [AUTH-002]:** Runtime yetkilendirme + cache yaklaşımı benimsenir.

**Gerekçe:** Kullanıcı attribute'ları değiştiğinde (örn. şirket değişimi) yetkilerin otomatik
güncellenmesi gerekir; snapshot modeli bunu kullanışsız kılar. Runtime çözümleme + cache optimum
dengeyi sağlar. Cache invalidation event-driven yapılır (bkz. [AUTH-007]).
```

ACTION-FIRST decision, written directly:

```
**Karar [CODE-002]:** Naming conventions — Klasör/dosya `kebab-case`, Class/Type `PascalCase`,
fonksiyon/değişken `camelCase`, constant/enum `UPPER_SNAKE_CASE`, DB tablo `snake_case` çoğul.
```
