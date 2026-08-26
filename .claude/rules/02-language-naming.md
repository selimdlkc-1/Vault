# Dil ve Adlandırma

**Arayüz Türkçe, kod İngilizce.** Kullanıcıya görünen her metin (etiket, buton, hata mesajı, bildirim, badge) Türkçedir. Kod tanımlayıcıları — değişken, fonksiyon, class, DB tablo/kolon, enum değeri, API path segmenti — İngilizcedir.

✓ Doğru: buton metni `"Transfer Başlat"`, kod `createTransfer()`, kolon `wallet_id`.
✗ Yanlış: kod içinde Türkçe değişken adı (`cuzdanId`) veya arayüzde İngilizce buton metni.

## Naming conventions

| Öğe | Format |
| --- | --- |
| Klasör/dosya | `kebab-case` |
| Class / Type | `PascalCase` |
| Fonksiyon / değişken | `camelCase` |
| Constant / enum değeri | `UPPER_SNAKE_CASE` |
| DB tablo/kolon | `snake_case`, tablo adı çoğul |

## Commit ve branch formatı

Conventional Commits: `<tip>(<kapsam>): <açıklama>`. Tipler: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`. Kapsam adları proje modülleriyle hizalı (`auth`, `wallets`, `transfers`, `chain-providers`, `db`, `ci` vb.).

Branch: `<tip>/<kısa-açıklama>` — açıklama kebab-case, İngilizce (ör. `feat/managed-wallet-creation`). Bir branch tek bir mantıksal değişikliği kapsar.

## Error code pattern

API hataları response envelope'unun `error.code` alanında `UPPER_SNAKE_CASE` bir kod taşır (ör. `CROSS_NETWORK_MISMATCH`, `INVALID_TRANSITION`); ham mesaj yalnızca `error.message`'da, kullanıcıya gösterilecek Türkçe metin frontend'de bu koda göre eşlenir.

---
Detay: `docs/09_DEV_WORKFLOW.md` §1–2; `docs/03_API_CONTRACTS.md` §3; `docs/mimari-kararlar.md` CODE-002
