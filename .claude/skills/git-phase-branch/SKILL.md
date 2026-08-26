---
name: git-phase-branch
description: Step-by-step procedure for starting a new roadmap sub-item (§N.M) as its own feature branch and PR, following the "1 chat ≈ 1 PR" discipline. Use when the user says let's start a phase sub-item, move to the next §N.M, or open a branch for roadmap work. Do NOT use for a branch unrelated to the phase roadmap (a hotfix, a doc-only change) — use a plain conventional branch name instead without this procedure's phase-linkage steps.
---

# Faz Alt Madde Branch Prosedürü

4 adım. Bir alt madde tamamlanmadan bir sonrakine geçilmez; bir fazın tüm alt maddeleri bitmeden bir sonraki faz başlamaz.

## 1. Bağımlılık kontrolü

`docs/10_IMPLEMENTATION_ROADMAP.md` §2'deki faz bağımlılık sırasına ve içinde bulunulan fazın önceki alt maddelerinin tamamlandığına bak — atlanan bir alt madde varsa önce onu tamamla.

## 2. Branch aç

`<tip>/<kısa-açıklama>` — tip Conventional Commits tipiyle aynı (`feat`, `fix`, `refactor`, ...), açıklama kebab-case İngilizce. Bir branch yalnızca tek bir `§N.M`'yi kapsar.

## 3. Kapsamı sınırla

Yalnızca ilgili alt maddenin tanımını (`docs/10` §3'teki `§N.M` paragrafı) ve bağımlı olduğu önceki çıktıyı bağlam al — tüm roadmap'i veya önceki fazların tam detayını yeniden okuma.

## 4. PR ve onay

PR açıklamasında: kısa özet, `§N.M` referansı, etkilenen modüller, nasıl test edildiği. Kritik modül (`13-critical-modules.md`) değişikliği varsa ilgili negatif senaryonun regresyon olarak eklendiği ayrıca belirtilir. Kullanıcının açık onayı olmadan `main`'e merge edilmez.

## 5. Dokümantasyon

- [ ] PR açıklaması `§N.M` referansı içeriyor

---
Detay: `docs/10_IMPLEMENTATION_ROADMAP.md` §1–2; `docs/09_DEV_WORKFLOW.md` §1, §4
