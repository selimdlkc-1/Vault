# CLAUDE.md Router Şablonu

Adım G çıktısı. Proje adını ve tabloları docs keşfinden doldur. **Kural metni tekrarlanmaz.** Hedef ≤150 satır.

---

~~~markdown
# <Proje Adı>

> Talimatlar `.claude/rules/` (koşulsuz + path-scoped) ve `.claude/skills/` (görev prosedürleri) altında.
> Bu dosya **yönlendiricidir**. Spec tek doğruluk kaynağı: `docs/`. Çelişkide **docs kazanır**.

## Çalışma Protokolü

1. Koşulsuz kurallar (`00–04`) her oturumda zaten yüklü — özet aşağıda, tereddütte tam dosyayı oku.
2. Bir dosyayı düzenlemeden önce path tablosundan ilgili rule'ı kontrol et; path-scoped rule dosya okununca otomatik yüklenir.
3. Görev bir prosedürse (endpoint, ekran, migration…) ilgili skill'i çalıştır.
4. Faz çalışmasıysa `phase-XX-*` skill'ini çalıştır; **kod öncesi** feature branch aç (`git-phase-branch`).
5. Spec detayı için `docs/` path'ine git — talimatlarda kopyalanmış tablo arama.

## Her Zaman Geçerli — Özet

Tam metin: `.claude/rules/00-*.md` … `04-*.md`

- **[00] Kimlik** — <1–2 cümle: ne, kim, stack pin>
- **[01] Felsefe** — MVP scope, test-first, self-review
- **[02] Naming** — TR UI / EN code, commit, error code
- **[03] Güvenlik** — 6 zorunlu kontrol; skip yasak
- **[04] Kalite** — coverage, CI, bundle, a11y eşikleri

## Path Yönlendirme

Bu rule'lar eşleşen dosya okunduğunda otomatik yüklenir.

| Dosya deseni | Rule |
| --- | --- |
| `<backend genel>` | `10-...` |
| `<auth>` | `11-...` |
| `<frontend genel>` | `20-...` |
| `<test>` | `35-...` |

> Birden fazla desen eşleşebilir — hepsi geçerli.

## Görev → Skill

| Görev türü | Skill |
| --- | --- |
| Yeni REST endpoint | `add-new-endpoint` |
| Yeni ekran | `add-new-screen` |
| DB migration | `add-prisma-migration` |
| Faz implementasyonu | `git-phase-branch` + ilgili `phase-XX-*` |

## Faz Yönlendirme

Mesajda **「Faz N — İterasyon M」** belirt.

| Faz | Skill |
| --- | --- |
| 0 … | `phase-00-...` |
| 1 … | `phase-01-...` |

Faz skill üretimi: `phase-creator`.

## docs/ — Nihai Kaynak

`<docs listesi — 00–10, adr/, processes/ …>`

> Spec değişikliği → önce docs güncelle, sonra ilgili talimat referansını doğrula.
~~~

---

## Doldurma notları

- Path tablosu: repoda `Glob` ile doğrulanmış desenler; uydurma yok.
- Faz tablosu: yalnızca **yazılmış** phase skill satırları.
- Özet maddeler: `00–04`'ten distile, tam metin kopyalama.
- Yazdıktan sonra kullanıcıya `/context` → **Memory files** kontrolünü hatırlat.
- `@path` import ekleme: import edilen dosya launch'ta context'e giriyor, `.claude/rules/` zaten yükleniyor — çift maliyet olur.
