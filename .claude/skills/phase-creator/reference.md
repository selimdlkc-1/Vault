# Faz Skill Referansı

`.claude/skills/phase-XX-<slug>/` dosyalarının **zorunlu yapısı** ve iterasyon kalıbı. Akış: `docs-map.md` ile `Docs/` güncelle → bu iskelet + `iteration-blueprint.md` ile faz skill'ini yaz.

## Docs ↔ faz skill ilişkisi

| Katman | Rol |
| ------ | --- |
| `Docs/00`–`10`, `mimari-kararlar.md` | **Tek doğruluk kaynağı** — spec, contract, ekran, roadmap |
| `.claude/skills/phase-XX-*/` | **Uygulama rehberi** — plan-modu kalitesinde iterasyonlar; spec'e pointer |
| `.claude/rules/*.md` | Sürekli geçerli convention ve eşikler — faz skill'i tekrarlamaz, referans verir |

| Skill'de **kalmaz** (yalnızca Docs'ta) | Skill'de **kalır** (iterasyon başına) |
| --------------------------------------- | -------------------------------------- |
| Tam API body, response örneği | Docs § referansı + uygulama notu |
| Ekran alan tablosu, UX state detayı | `S-*` ID listesi + hangi § okunacak |
| DB kolon listesi | Tablo adı + migration dosya adı + `Docs/02` § |
| 50+ satırlık dosya ağacı | İterasyon **Dosya kapsamı** tablosu (≤12 satır) |
| Coverage/lint eşikleri | `.claude/rules/04-quality-gates.md`'e referans |

---

## Konum ve adlandırma

| Parça | Kural | Örnek |
| ----- | ----- | ----- |
| Dizin | `.claude/skills/phase-XX-<kebab-slug>/` | `.claude/skills/phase-01-backend-core/` |
| Ana dosya | `SKILL.md` | — |
| İterasyon dosyaları | `iterations/MM-<slug>.md` (5+ iterasyonda) | `iterations/03-auth-endpoints.md` |
| `XX` | Roadmap faz no, 2 hane | Faz 1 → `01` |
| `name` | Klasör adıyla birebir; ≤64 karakter | `phase-01-backend-core` |
| Çağrı | Kullanıcı: `Faz N — İterasyon M` | Description bunu tetikleyici olarak içerir |

Cursor'daki `NN` sıra numarası (50, 51 …) **kalkar** — skill'ler numarayla değil description ile seçilir.

### Description kalıbı

```yaml
description: '[Faz N] <özet> — <K> iterasyon/chat (<iter1> → <iter2> → …). Use when the user says "Faz N", "Faz N — İterasyon M", or asks to implement <kapsam>. Do NOT use for <komşu faz>.'
```

Tetikleyici cümle ve dışlama olmadan skill ya hiç tetiklenmez ya da yanlış fazda açılır.

---

## Faz skill iskeleti (üst seviye)

````markdown
---
name: phase-01-backend-core
description: '[Faz 1] …'
---

# Faz 1: <Başlık>

## Goal
<1–3 cümle; detay `Docs/10` Faz 1>

## Feature branch (zorunlu)
<`git-phase-branch` skill'i; branch adı; İterasyon 1 öncesi Stop>

## Bu fazın çalışma modeli
- Tek sohbet fazı bitirmez
- Her chat başında **「Faz 1 — İterasyon M」** belirt
- Agent **yalnızca o iterasyonun Docs okuma sırasını** okur; tüm spec değil
- Plan moduna geçme — iterasyon blueprint yeterli

## İterasyon indeksi

| # | Teslim | Dosya |
| - | ------ | ----- |
| 1 | App iskeleti + config | `iterations/01-app-skeleton.md` |
| 2 | Security util (JWT, hash) | `iterations/02-security-utils.md` |
| 3 | Auth endpoints | `iterations/03-auth-endpoints.md` |

> Yalnızca çalıştığın iterasyonun dosyasını oku.

## Required Context
- `Docs/…` §… — faz geneli (iterasyon listesi için `Docs/10` Faz 1)
- `.claude/rules/03-security-baseline.md`, `04-quality-gates.md` — zaten yüklü, tekrar edilmez

## Done Definition
- [ ] Ölçülebilir maddeler; `S-*` / endpoint ID ile

## Explicit Don'ts
- MVP dışı + `Docs/00` uyumu

---
Faz bitti → `Docs/10_IMPLEMENTATION_ROADMAP.md` Faz 1 işareti.
````

4 ve altı iterasyonda `iterations/` yerine iterasyonları doğrudan `SKILL.md` içine göm; indeks tablosu yerine `### İterasyon N` başlıkları.

**İterasyon detayı:** `iteration-blueprint.md` — her iterasyon için zorunlu 11 bölüm.

---

## İterasyon tasarım ilkeleri

| İlke | Uygulama |
| ---- | -------- |
| Plan modu yerine geçer | Uygulama planı + Spec→kod + Stop; agent tekrar planlamaz |
| Context window | 1 chat ≈ 1 PR; ≤12 dosya; Docs okuma ≤5 dosya/iterasyon |
| Docs pointer | Her adım `Docs/X` §Y ile bağlı; belirsiz "spec'e bak" yok |
| Hedef önce | `**Hedef:**` ölçülebilir tek cümle |
| Scope duvarı | `**Bu iterasyonda yok:**` + Dosya kapsamı "Dokunma" |
| Doğrulama | Stop'ta çalıştırılabilir test/lint/smoke komutu |
| Boyut | Tipik 4–8 iterasyon; 9+ ancak net alt-dalga (UI dalgaları) |
| Sıra | Altyapı → domain/DB → API → UI → entegrasyon |

### Stop kalıbı

```
**Stop:**
- [ ] <komut veya smoke>
- [ ] <test>
- [ ] PR/onay → İterasyon N+1
```

---

## İyi vs kötü iterasyon

**İyi** — uygulama hazır, context sınırlı:

```markdown
### İterasyon 3 — Auth Endpoints (1.3)

**Hedef:** Login/refresh/logout + integration test yeşil.

**Docs okuma sırası:**
1. `Docs/10_IMPLEMENTATION_ROADMAP.md` §1.3
2. `Docs/03_API_CONTRACTS.md` §2
3. `Docs/07_SECURITY_IMPLEMENTATION.md` §2–3

**Uygulama planı:**
1. `schemas/auth.py` — `Docs/03` §2.1 alanları
2. `routers/auth.py` — üç endpoint + rate limit
3. `tests/integration/test_auth_flow.py`

**Dosya kapsamı:** … (tablo)
**Spec → kod eşlemesi:** … (≥3 satır)
**Stop:** [ ] `pytest tests/integration/test_auth_flow.py -v`
```

**Kötü** — plan modu gerekir, context belirsiz:

```markdown
### İterasyon 1 — Backend

**Hedef:** Auth ve user API.
**Minimum bağlam:** Docs/03, Docs/04
**Stop:** Testler yeşil.
```

---

## Katman ipuçları (iterasyon dizisi)

| Faz tipi | Tipik iterasyon dizisi |
| -------- | ---------------------- |
| Altyapı | scaffold → CI → migration dalgaları → IaC |
| Backend API | app iskelet → security util → endpoint grubu → audit → seed |
| Collector/worker | BaseCollector → tek kaynak tipi → orchestration |
| Frontend | route+layout → data hook → ekran → admin sayfası |
| Full-stack | API iterasyonu → UI iterasyonu (karıştırma) |

---

## Cursor'dan taşıma

Mevcut `.cursor/rules/NN-phase-XX-*.mdc` dosyaları varsa:

| Cursor | Claude Code |
| ------ | ----------- |
| `50-phase-00-infra-scaffold.mdc` | `.claude/skills/phase-00-infra-scaffold/` |
| `51-phase-01-backend-core.mdc` | `.claude/skills/phase-01-backend-core/` |
| `52.1-phase-02-google-sso.mdc` | `.claude/skills/phase-02-google-sso/` |
| `description: '[Faz N] …'` | Aynı metin + tetikleyici cümle + dışlama eklenir |
| `@NN-phase-XX-slug` invoke | Kullanıcı `Faz N — İterasyon M` yazar |

`NN` sıra numarası düşer; roadmap faz no (`XX`) kalır. Alt fazlar (`52.1`) ayrı skill klasörü olur.

Yeni faz yazarken komşu fazın `SKILL.md`'sini `Read` ile aç; ton ve detay seviyesini kopyala, içeriği `Docs/`'tan türet. Eski kısa iterasyonlar yeniden üretimde `iteration-blueprint.md` seviyesine yükseltilir.

---

## Roadmap hizalama

- Faz no ↔ `Docs/10_IMPLEMENTATION_ROADMAP.md`
- Roadmap faz detayı **Adım 4 (Docs)** içinde yazılır; iterasyonlar `§N.M` ile roadmap alt maddelerine hizalanır
- Faz skill'i yazıldıktan sonra `CLAUDE.md` faz tablosuna satır ekle
