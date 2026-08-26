# Decision Protocol & Document Conventions

The rules that make `mimari-kararlar.md` a zero-ambiguity single source of truth. These conventions are what let the downstream pipeline (project-doc-architect → rules-architect → phase-creator) produce drift-free `docs/` and `.claude/` outputs. Follow them exactly.

## 1. Decision ID scheme

Every decision gets a unique, stable ID: `[KATEGORI-SIRA]`, e.g. `[AUTH-003]`, `[SEC-050]`.

- **KATEGORI** = the section's prefix (see `section-catalog.md`): P, S, A, AUTH, R, W, T, D, AP, SEC, AUD, I, N, TS, INF, TEST, CODE.
- **SIRA** = zero-padded sequence within that category, assigned in creation order.
- IDs are **immutable and never reused.** If a decision is reversed, write a new decision that supersedes it and note the supersession; do not silently rewrite history. (Exception: in early drafts, before any downstream doc consumes an ID, in-place edits are fine.)
- Open (undecided) items use `[KATEGORI-OPEN-N]`, e.g. `[INF-OPEN-4]`. When closed, they are removed from Section 18 and the closing is recorded in the version history.

**Before assigning a new ID in a category, check the highest existing one:**
`Grep '\[AUTH-[0-9]+\]' docs/mimari-kararlar.md`. Never guess the next number from memory — on resume you have not read the whole file.

## 2. Decision anatomy

```
**Karar [KATEGORI-SIRA]:** <kararın net ifadesi — ne yapılacağı, tek cümlede özü>.

<gerekçe (varsa) — neden bu seçim; reddedilen alternatifler kısaca>
<çapraz referanslar — bağlı kararlar [X-NNN], [Y-NNN]>
<örnek / şema / tablo (gerekiyorsa)>
```

- **Net ifade zorunlu.** "Şifreleme iyi olmalı" değil; "PII alanları AES-256-GCM ile field-level şifrelenir, anahtar KMS envelope encryption ile yönetilir [SEC-008]" gibi.
- **Gerekçe** mimari/güvenlik kararlarında neredeyse her zaman bulunur. Konvansiyon kararlarında opsiyonel.
- **Çapraz referans** kararı diğerlerine bağlar. Bir karar başka bir kararı etkiliyorsa ID ile birbirine bağla — bu, agent'in bir kuralı uygularken bağlı kuralları görmesini sağlar.

## 3. Decision modes — when to ask, when to act

The project owner prefers minimum-question, action-first interaction. Balance that against not inventing decisions:

- **ONAY (approval required)** — architectural, security, business-rule, scaling, integration and tech-stack decisions. Protocol: *kavramı gerekirse kısaca açıkla → trade-off'larıyla öneri sun → onay al → ID'le ve yaz.* Never write an ONAY decision the owner hasn't agreed to.
- **ACTION-FIRST (propose-and-write)** — mechanical/convention decisions: naming conventions, commit format, folder layout, file naming. Protocol: *makul bir default'u doğrudan yaz, "şunu şöyle aldım, itiraz edersen düzeltirim" de.*

When unsure, default to ONAY for anything touching data model, security, money, scale or external contracts; ACTION-FIRST for everything else.

## 4. Elicitation rhythm

- Ask **clustered questions per topic**, not one at a time. Group a section's open questions into one batch, then generate follow-ups from the answers.
- Claude Code has no interactive choice widget: number the options (`1a / 1b / 1c`) so the answer can be a short list.
- A section should usually close in 1–2 turns. Don't interrogate.
- After each section, **persist with `Edit`** and give a short "kapanan / açık" summary.

## 5. Open-item discipline (integrity backbone)

If a decision can't be made now (owner doesn't know, depends on external input, deferred to team):

- Do **not** invent it.
- Write it into Section 18 as `[KATEGORI-OPEN-N]` with a priority tag: 🔴 Kritik / 🟠 Yüksek / 🟢 Düşük (MVP sonrası).
- Keep the standing note: "Bu kararlar tamamlanmadan ilgili kod parçalarının geliştirilmesine başlanmamalıdır."
- "Defer to team" is a valid resolution — record it as such rather than forcing a guess.

## 6. Version history

Maintain a version-history table at the bottom. Each meaningful editing session bumps the version and records: which IDs were added, which OPEN items closed, what changed. This is the audit trail **and the cross-session resume point** — on resume it is the first thing to read.

```
| Versiyon | Tarih | Açıklama |
| 0.1 | <tarih> | İlk taslak. <kapsananlar>. <açık bırakılanlar>. |
```

## 7. Document size & context budget

- Heavy sections (Security, Authorization) naturally grow large. Expected — do not trim them for size.
- The file is **not** split; it is one source of truth. But it is also **not** read whole on resume: version history → Section 18 → `Grep '^## '` → read only the target section.
- If the file passes roughly 100KB, warn the user that `project-doc-architect` may need to consume it in chunks. That is a downstream concern, not a reason to restructure this file.
- Never add this file to `CLAUDE.md` as an `@` import — imports load at session start and this document would consume the entire context budget every session.

## 8. Language policy (hybrid)

- Document **content** (prose, decision statements, rationale): **Turkish.**
- **Code identifiers, enum names, table/column names, API paths, branch names, commit types, error codes, env var names:** **English.**
- Skill instructions themselves: English. This matches project-doc-architect.

## 9. Terminology lock

When a domain term is first fixed (e.g. "master data", "süreç örneği / process instance", "çalışma alt alanı / work sub-area"), record both the Turkish and English form once and reuse exactly. Inconsistent terminology is a primary source of agent drift. If the project has many such terms, keep a small terminology table near the top of the document.

## 10. Header & footer scaffolding

Top of document:

```
# <Proje Adı> — Mimari Kararlar Dokümanı

> **Versiyon:** <x.y> (<durum>)
> **Son güncelleme:** <tarih>
> **Durum:** <bir cümlelik durum özeti>
> **Amaç:** Bu doküman `docs/` ve `.claude/` altındaki tüm dosyaların referans alacağı tek
> doğruluk kaynağıdır. Tüm mimari ve iş kuralı kararları buraya işlenir.

## İçindekiler
<bölüm linkleri>
```

Bottom: version history table + a short "Nasıl Kullanılır?" block explaining the ID-reference workflow and that this file feeds `project-doc-architect`.
