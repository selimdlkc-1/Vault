---
name: rules-architect
description: Designs a project's instruction architecture from its docs/ — unconditional core rules and path-scoped rules under .claude/rules/, task procedures as skills under .claude/skills/, and a root CLAUDE.md router — all referencing docs/ as the single source of truth instead of duplicating spec. Use when the user says rules-architect, "kural mimarisi kur", "docs'tan kural üret", "proje kurallarını tasarla", "CLAUDE.md yaz", "path-scoped rule ekle", when bootstrapping instructions for a repo whose docs/ is ready, or when migrating an existing .cursor/rules/ pack. Do NOT use for: phase rules (use the phase-creator skill), post-implementation gap audits (phase-controller), producing the docs/ set itself (project-doc-architect), or a one-off tweak to a single existing rule file.
---

# Rules Architect

`docs/` hazır → talimat mimarisini tasarla → **onay al** → dosyaları yaz → router → fazları `phase-creator`'a devret.

## Hedef çıktı

```
<proje>/
├── CLAUDE.md                     # Router — her oturum yüklenir, ≤150 satır
├── .claude/
│   ├── rules/
│   │   ├── 00-project-identity.md    # frontmatter YOK → her oturum
│   │   ├── 01-coding-philosophy.md
│   │   ├── 02-language-naming.md
│   │   ├── 03-security-baseline.md
│   │   ├── 04-quality-gates.md
│   │   ├── 10-backend-architecture.md  # paths: → eşleşince yüklenir
│   │   ├── 14-backend-controllers.md
│   │   ├── 20-frontend-architecture.md
│   │   └── 35-testing.md
│   └── skills/
│       ├── add-new-endpoint/SKILL.md   # description tetikler
│       ├── add-new-screen/SKILL.md
│       └── phase-01-<slug>/SKILL.md    # phase-creator üretir
└── docs/                          # TEK DOĞRULUK KAYNAĞI — dokunma
```

## Mekanizma seçim ağacı

Her kural parçası için sırayla sor:

```
Her oturumda gerekli mi (prensip, stack pin, güvenlik checklist)?
├─ Evet → .claude/rules/NN-*.md, frontmatter YOK
└─ Hayır
    ├─ Belirli dosya yollarına mı bağlı?
    │   ├─ Evet → .claude/rules/NN-*.md + frontmatter `paths:`
    │   └─ Hayır → adım adım prosedür mü?
    │       ├─ Evet → .claude/skills/<ad>/SKILL.md
    │       └─ Hayır → muhtemelen docs/ içeriği, rule değil
```

Kararsız kaldığında **skill'i tercih et** — skill sadece tetiklendiğinde yüklenir, rule context'te oturur.

## Zorunlu kurallar

1. **Docs önce, rules sonra.** Spec `docs/` içinde kalır; rule/skill yalnızca path + bölüm referansı verir. Tam tablo, API body, kolon listesi, ekran alan listesi **kopyalanmaz**.
2. **Onay kapısı.** Mimari taslak + dosya listesi onaylanmadan tek dosya yazma. Adım C'de dur.
3. **Tek soru kuralı.** Keşif ve tasarım turunda her mesajda yalnızca **bir** soru.
4. **Mekanizma disiplini.** Bir dosya ya koşulsuz rule, ya path-scoped rule, ya skill. Karıştırma. `paths:` olan dosyaya "her zaman geçerli" içerik koyma.
5. **Satır bütçesi.**
   - `CLAUDE.md` ≤150 satır
   - Koşulsuz rule ≤120 satır/dosya, **toplam ≤500**
   - Path-scoped rule ≤200 satır
   - `SKILL.md` ≤300 satır; uzun materyal aynı klasörde ayrı `.md`, relative path ile çağrılır

   200 satırı aşan her zaman-yüklenen dosya context yer ve talimata uyumu düşürür.
6. **Faz kurallarını yazma.** `phase-*` skill'leri `phase-creator`'ın işi.
7. **Uydurma yok.** Her `paths:` desenini `Glob` ile doğrula; 0 eşleşme = desen yanlış. docs'ta olmayan kararı yazma, eksik olarak raporla.

## Akış

```
[A Docs keşfi] → [B Mimari taslak] → [C ONAY]
  → [D Koşulsuz rules 00–04] → [E Path-scoped rules 10–3x]
  → [F How-to skills] → [G CLAUDE.md router] → [H phase-creator devri]
```

Sıra değişmez.

---

## Adım A — Docs keşfi

`Glob docs/**/*.md` çek, sonra:

| Kaynak | Ne çıkar |
| ------ | -------- |
| `docs/00_*` … `docs/10_*` | Kapsam, domain, stack, API, ekran, güvenlik, test, workflow, roadmap |
| `docs/adr/`, `docs/mimari-kararlar.md` | Sabit kararlar, stack pin |
| `apps/`, `packages/`, `infrastructure/` | Gerçek `paths:` desenleri |
| Mevcut `CLAUDE.md`, `.claude/rules/`, `.claude/skills/` | Boşluk / duplikasyon / çakışma |
| Mevcut `.cursor/rules/*.mdc` | Migrasyon kaynağı — dönüştürülecek içerik |

**Okuma stratejisi:** `00`, `09`, `10` tam oku. `04`, `05`, `07`, `08` için önce `Grep '^#'` ile başlık taraması, sonra yalnızca stack / domain / eşik bölümleri. Tüm docs'u baştan sona okuma.

Kullanıcıya sun:

```markdown
## Docs özeti

**Proje:** …
**Stack (pin'li):** …
**Domain terimleri:** …

| Docs dosyası | Rol | Durum (tam/kısmi/eksik) |

**Mevcut talimat durumu:** CLAUDE.md var/yok · .claude/rules N dosya · .claude/skills M skill
**İlk boşluk:** …

**Soru:** …?   ← tek soru
```

**Edge case:** `docs/00` veya `docs/10` yoksa ya da stack pin'lenmemişse **dur**. Eksik doküman listesi çıkar, `project-doc-architect` veya `architecture-decisions-architect` öner, onay bekle.

---

## Adım B — Mimari taslak

Dosya yazma. Önce bu klasördeki `layer-taxonomy.md` dosyasını oku (numaralandırma, frontmatter, bütçe). Sonra sun:

```markdown
## Önerilen talimat mimarisi

### Mekanizma tablosu

| Mekanizma | Konum | Tetikleme | Dosya | Bütçe |
| Koşulsuz rule | .claude/rules/00–04 | her oturum | 5 | ~100/dosya |
| Path-scoped rule | .claude/rules/10–3x | paths: eşleşmesi | N | ~150–200 |
| How-to skill | .claude/skills/<ad>/ | description | M | ~200–300 |
| Faz skill | .claude/skills/phase-XX-*/ | description | roadmap'ten | phase-creator |
| Router | ./CLAUDE.md | her oturum | 1 | ~150 |

### Dosya listesi (taslak)

| Dosya | Mekanizma | paths / description | docs referansı | Tahmini satır |

### Context bütçesi

- Oturum başı (CLAUDE.md + 00–04): ~X satır
- Backend controller edit: +Y satır (hangi path-scoped rule'lar tetiklenir)
- Yeni endpoint görevi: +Z (add-new-endpoint skill)

### Yazılmayacaklar
### Faz planı (phase-creator devri)

Onaylıyor musun? Sıra: 00–04 → path-scoped → skills → CLAUDE.md.
```

---

## Adım C — Onay kapısı

Kullanıcı açıkça onaylamadan `Write` çağırma. Düzeltme gelirse taslağı güncelle, tekrar onay iste.

---

## Adım D — Koşulsuz rules (00–04)

`.claude/rules/NN-slug.md`. **Frontmatter yok** — `paths` alanı olmayan rule koşulsuz yüklenir.

| NN | İçerik | docs kaynağı |
| -- | ------ | ------------ |
| 00 | Kimlik, stack pin, monorepo ağacı (≤12 satır), domain terimleri, MVP dışı | `00`, `01`, ADR |
| 01 | MVP scope, test-first, self-review, vibe coding disiplini | `10` Böl. 1, `09` |
| 02 | TR UI / EN code naming, commit formatı, error code pattern | `09` Böl. 3 |
| 03 | Güvenlik — 6 zorunlu kontrol, checkbox formatında | `07` özet |
| 04 | Coverage, CI gate, bundle, a11y eşikleri | `08`, `09` |

**Yazım kuralı:** doğrulanabilir spesifiklik. "Kodu düzgün formatla" ❌ → "2 space indent, `npm run lint` commit öncesi" ✓. En fazla 1 doğru / 1 yanlış örnek. Uzun spec yerine footer: `Detay: docs/XX Bölüm Y`.

İskeletler: bu klasördeki `reference.md` dosyasını oku.

---

## Adım E — Path-scoped rules (10–3x)

```markdown
---
paths:
  - "apps/api/**/*.controller.ts"
  - "apps/api/src/**/*.{ts,tsx}"
---

# Backend Controllers

<2 cümle context>
```

Kurallar:

- Frontmatter'da **yalnızca `paths`**. `description`, `globs`, `alwaysApply` yok. Rule'un ne olduğunu H1 + ilk satır anlatır.
- Genel kural (10, 20) geniş desen; spesifik kural (14, 22) dar desen.
- Aynı dosyanın birden çok rule tetiklemesi normal (controller = 10 + 14) — bilinçli tasarla.
- `**/*.ts` gibi tüm repoyu kapsayan desen yazma.
- Brace expansion (`*.{ts,tsx}`) destekli ama her grup deseni katlar; 2 grubu geçme.
- Yazmadan önce her deseni `Glob` ile çalıştır. 0 eşleşme → düzelt veya rule'ı iptal et.
- İçerik: **pattern + convention + anti-pattern**. Spec tablosu yok, `docs/03 Bölüm X` referansı var.

**Alternatif:** Monorepo'da bir paketin tamamı için kural gerekiyorsa `apps/api/CLAUDE.md` da kullanılabilir (alt dizin CLAUDE.md'leri o dizindeki dosyalar okunduğunda yüklenir). Ama `/compact` sonrası otomatik geri yüklenmezler — kritik kuralları path-scoped rule olarak yaz, alt dizin CLAUDE.md'sini yalnızca paket-özel build/test komutları için kullan.

---

## Adım F — How-to skills

Her prosedür ayrı klasör: `.claude/skills/<ad>/SKILL.md`.

```yaml
---
name: add-new-endpoint
description: Step-by-step procedure for adding or modifying a REST endpoint — DTO, Zod validation, permission guard, audit log, controller wiring, contract doc update. Use when the user asks to add an endpoint, expose a new route, or change an existing controller signature. Do NOT use for GraphQL resolvers or for frontend data fetching.
---
```

- `name`: küçük harf + tire, klasör adıyla birebir aynı, ≤64 karakter.
- `description`: NE + NE ZAMAN + NE ZAMAN DEĞİL. Tek cümlelik jenerik açıklama yazma — bu alan skill'in tetiklenip tetiklenmeyeceğine karar veren tek şey.
- Gövde emir kipinde, numaralı adımlar, her adım tek concern, sonunda dokümantasyon checkbox'ı.
- Tipik set: `add-new-endpoint`, `add-new-screen`, `add-prisma-migration`, `add-new-permission`, `refactor-to-pattern`, `write-adr`, `fix-failing-test`, `git-phase-branch`.
- Skill adında rakam prefix'i kullanma; numaralandırma yalnızca `.claude/rules/` için.

---

## Adım G — Router (`CLAUDE.md`)

Şablonu bu klasördeki `router-template.md` dosyasından oku ve doldur.

- Proje kökünde `./CLAUDE.md`.
- İçerik: çalışma protokolü + koşulsuz rules özeti (1–2 cümle each) + path→rule tablosu + görev→skill tablosu + faz tablosu + `docs/` indeksi + "çelişkide docs kazanır".
- Router **asla** rule'ların pattern bölümünü tekrar etmez.
- `@path` import kullanma: import edilen dosya da launch'ta context'e giriyor, kazanç yok — sadece organizasyon sağlıyor. Rule'lar zaten `.claude/rules/` üzerinden yükleniyor, ikinci kez import etme.
- Yazdıktan sonra kullanıcıya söyle: oturumda `/context` çalıştırıp **Memory files** listesinde dosyaların göründüğünü doğrulasın.

**Edge case:** `CLAUDE.md` zaten varsa üzerine yazma. Oku, yalnızca yönlendirme bölümlerini ekle/güncelle, kullanıcının yazdığı bölümleri koru.

---

## Adım H — Faz devri

1. `docs/10_IMPLEMENTATION_ROADMAP.md` faz listesini oku.
2. Hangi fazın skill'i var / eksik, tablo çıkar.
3. Eksikler için `~/.claude/skills/phase-creator/SKILL.md` dosyasını oku ve o akışı uygula.
4. Faz içeriğini bu skill içinde **yazma**.

Kapanış:

```markdown
## Talimat mimarisi tamamlandı

| Mekanizma | Yazılan | Satır |

**Doğrulama:** `/context` → Memory files listesini kontrol et.
**Sonraki adım:** Faz N için phase-creator ile devam edelim mi?
**Implementasyon sonrası:** phase-controller ile gap audit.
```

---

## Dosya başına doğrulama checklist

- [ ] Tek mekanizma (koşulsuz rule XOR path-scoped rule XOR skill)
- [ ] Spec duplikasyonu yok — path + bölüm referansı var
- [ ] Satır bütçesi içinde
- [ ] Frontmatter geçerli YAML; rule'da yalnızca `paths`, skill'de yalnızca `name` + `description`
- [ ] `paths` desenleri `Glob` ile doğrulandı, eşleşme > 0
- [ ] Skill `name` = klasör adı
- [ ] Numara çakışması yok (`Glob .claude/rules/*.md`)
- [ ] `CLAUDE.md` tablosunda karşılık gelen satır var
- [ ] docs ile çelişki yok — çelişki varsa docs güncellemesi öner, rule'da uydurma
- [ ] Rule'lar arasında çelişen talimat yok (çelişirse hangisinin uygulanacağı belirsizleşir)

---

## Senaryo matrisi

| Durum | Davranış |
| ----- | -------- |
| Talimat yok, `docs/` dolu | Tam akış A→H |
| Kısmi talimat var | Gap analizi; yalnızca eksik mekanizma/dosya |
| `.cursor/rules/*.mdc` var, Claude Code'a taşınıyor | `.mdc`'leri oku → mekanizma ağacından geçir → `alwaysApply`→frontmatter'sız rule, `globs:`→`paths:`, description-only→skill. `.cursor/` klasörünü silme, kullanıcıya sor |
| `docs/` eksik | Dur, doküman tamamlama listesi öner |
| Sadece faz isteniyor | Bu skill'i atla, phase-creator |
| Tek rule düzeltmesi | Bu skill'i çalıştırma, doğrudan düzenle |

---

## Anti-pattern'ler

- ❌ Onaysız dosya yazmak
- ❌ API / ekran / DB spec'ini rule'a kopyalamak
- ❌ Her şeyi koşulsuz rule yapmak (`paths` yazmayı unutmak)
- ❌ Tek dev `CLAUDE.md` (500+ satır monolith)
- ❌ Rule'ları `CLAUDE.md`'den `@` ile import etmek — çift yükleme
- ❌ `paths` yerine Cursor'ın `globs` alanını yazmak
- ❌ Router'da rule metnini tekrarlamak
- ❌ Faz skill'ini phase-creator'ı atlayarak yazmak
- ❌ Doğrulanmamış path deseni
- ❌ "Kodu temiz yaz" tipi doğrulanamaz talimat

## Ek kaynaklar

Gerektiğinde `Read` ile aç (bu skill klasöründe):

- `layer-taxonomy.md` — mekanizma haritası, numaralandırma, frontmatter, context bütçesi
- `reference.md` — docs↔rules eşleme haritası, distilasyon kuralları, dosya iskeletleri, gap checklist
- `router-template.md` — `CLAUDE.md` şablonu
