# Vault — Mimari Kararlar Dokümanı

> **Versiyon:** 0.6 (Taslak — tüm çekirdek bölümler kapandı)
> **Son güncelleme:** 2026-08-31
> **Durum:** §1–§6, §9–§17 tamamen yazıldı. §7 ve §8 kapsam dışı. Açık kalan: SEC-OPEN-1 (2FA, 🟠 MVP-sonrası), I-OPEN-1 (BTC/XRP, 🟢 MVP-sonrası), SEC-OPEN-6/7 ve AUD-OPEN-2 (🟢 düşük öncelik, MVP-sonrası). Sıradaki adım: cross-reference taraması + `project-doc-architect`.
> **Amaç:** Bu doküman `docs/` ve `.claude/` altındaki tüm dosyaların referans alacağı tek doğruluk kaynağıdır. Tüm mimari ve iş kuralı kararları buraya işlenir.

---

## İçindekiler

- [Terminoloji Kilidi](#terminoloji-kilidi)
- [1. Proje Kimliği ve Kapsam](#1-proje-kimliği-ve-kapsam)
- [2. Kullanıcı Havuzu ve Ölçek](#2-kullanıcı-havuzu-ve-ölçek)
- [3. Kimlik Doğrulama ve Kullanıcı Yapısı](#3-kimlik-doğrulama-ve-kullanıcı-yapısı)
- [4. Yetkilendirme Mimarisi](#4-yetkilendirme-mimarisi)
- [5. Roller ve Yetki Yönetimi](#5-roller-ve-yetki-yönetimi)
- [6. Süreç (Workflow) Mimarisi](#6-süreç-workflow-mimarisi)
- [7. Görev Yönetimi](#7-görev-yönetimi)
- [8. Doküman Yönetimi](#8-doküman-yönetimi)
- [9. Admin Panelleri](#9-admin-panelleri)
- [10. Güvenlik ve KVKK](#10-güvenlik-ve-kvkk)
- [11. Denetim (Audit Log)](#11-denetim-audit-log)
- [12. Entegrasyonlar](#12-entegrasyonlar)
- [13. Bildirim Sistemi](#13-bildirim-sistemi)
- [14. Tech Stack](#14-tech-stack)
- [15. Altyapı ve Operasyon](#15-altyapı-ve-operasyon)
- [16. Test Stratejisi](#16-test-stratejisi)
- [17. Kod Organizasyonu ve Agent Kuralları](#17-kod-organizasyonu-ve-agent-kuralları)
- [18. Açık Kararlar — Tamamlanması Gerekenler](#18-açık-kararlar--tamamlanması-gerekenler)

---

## Terminoloji Kilidi

| Terim (TR) | Terim (EN) | Anlamı |
| --- | --- | --- |
| Hesap birimi | `quote_asset` / `QuoteCurrency` | Portföyün toplam değerinin ifade edildiği network-agnostic birim; sabit olarak USDT. Bir *varlık* (asset) değildir. |
| Varlık | `Asset` | Bir network üzerinde var olan somut token/coin instance'ı (ör. Sepolia USDT, Tron USDT — ayrı kontratlar). |
| İzleme-amaçlı cüzdan | Watch-only wallet | Private key'i sistemde olmayan, sadece bakiye/hareket takibi yapılan harici adres. |
| Yönetilen cüzdan | Managed wallet | Sistemin ürettiği, private key'i şifreli sakladığı, transfer yapabilen cüzdan. |
| Zincir hareketi | Chain movement | Zincirde gerçekleşen, indexlenen ham transfer kaydı (tüm cüzdanlarda). |
| Sistem içi transfer | System transfer | Uygulama üzerinden başlatılan, state machine'i olan gönderim (yalnızca managed cüzdan). |
| Ağ | Network | Sepolia, BSC Testnet, Tron Shasta gibi bir blok zinciri ağı. |

---

## 1. Proje Kimliği ve Kapsam

**Karar [P-001]:** Vault, kullanıcının testnet kripto cüzdanlarını sisteme tanımlayıp mal varlığını takip ettiği, görselleştirdiği ve cüzdanlar arası transfer yapabildiği bir **portföy & transfer uygulamasıdır.**

**Karar [P-002]:** Vault bir exchange **değildir.** Swap, order book, matching engine, likidite havuzu, fiat satın alma kapsam dışıdır. Tek desteklenen işlem: aynı varlığın aynı network içinde adresten adrese transferi (ör. Sepolia USDT → başka bir Sepolia adresi).

**Karar [P-003]:** Sistem **testnet-only**'dir; mainnet'e hiçbir koşulda bağlanılmaz. Bu kısıt kod seviyesinde bir chain-id allowlist ile zorlanır [cross-ref [I-001](#12-entegrasyonlar), [SEC-005](#10-güvenlik-ve-kvkk)] ve güvenlik sınırı olarak §10'da tekrarlanır.

**Karar [P-004]:** Custody modeli **hibrittir:**
- **Watch-only:** kullanıcı harici bir adresi ekler; sadece bakiye ve hareket geçmişi okunur, private key sistemde yoktur, transfer yapılamaz.
- **Managed:** sistem kullanıcı için HD wallet (BIP-32/44) türetir, private key'i şifreli saklar; transfer yalnızca bu cüzdanlardan yapılabilir.

Key saklama tasarımının teknik detayı §10'da ayrı bir ONAY kararı olarak ele alınır [cross-ref [SEC-OPEN-2](#18-açık-kararlar--tamamlanması-gerekenler)].

**Karar [P-005]:** Bu custody tasarımı **testnet-only**'dir ve mainnet'e taşınamaz. Mainnet'e taşımak; tamamen yeni bir tehdit modeli, custody mimarisi (HSM/MPC gibi) ve regülasyon incelemesi gerektirir — bu projenin kapsamı dışındadır [cross-ref [SEC-005](#10-güvenlik-ve-kvkk)].

**Karar [P-006]:** Temel domain modeli:

```
User 1──N Wallet { type: watch_only | managed, network_id, address, encrypted_private_key? }
Network 1──N Asset (join: is_active bayrağı; native asset'te contract_address = NULL)
Wallet 1──N BalanceCache (worker tarafından güncellenen, DB'de tutulan bakiye)
Wallet 1──N Transfer (yalnızca managed cüzdanlar)
Wallet 1──N ChainMovement (watch-only dahil tüm cüzdanlar)
```

Bu şema, aşağıdaki tüm bölümlerin referans aldığı temel varlık modelidir.

**Karar [P-007]:** Proje amacı **portföy/işe alım (recruitment) projesidir**; yayına alınmayacak, gerçek kullanıcı olmayacaktır. Ölçek kararları buna göre verilir — over-engineering yapılmaz, ancak mimari olgunluk (ayrıştırılmış katmanlar, state machine, provider soyutlaması) korunur [cross-ref [S-001](#2-kullanıcı-havuzu-ve-ölçek)].

**Karar [P-008]:** Dil politikası — arayüz **Türkçe**, kod tanımlayıcıları (değişken, fonksiyon, tablo/kolon adı, enum, API path) **İngilizce.**

**Karar [P-009] (ACTION-FIRST):** Platform — yalnızca responsive **web** uygulaması. Native mobil uygulama MVP kapsamı dışıdır (itiraz edersen düzeltirim).

**Karar [P-010] (ACTION-FIRST):** Monetizasyon yoktur; demo/portföy amaçlı, ücretlendirme modeli tasarlanmaz.

**Karar [P-011]:** Portföy görünümü — kullanıcı tek ekranda tüm cüzdanlarını ve her cüzdandaki varlıkları **kendi biriminde** görür (ör. ETH 0.12, TRX 1200, USDT 500); ekranın altında tüm cüzdanların toplamı **USDT cinsinden tek bir rakam** olarak gösterilir.

**Karar [P-012]:** Toplam bakiye **USDT cinsinden** gösterilir. `$` veya başka bir fiat sembolü **hiçbir yerde kullanılmaz** [cross-ref [CODE-004](#17-kod-organizasyonu-ve-agent-kuralları)].

**Karar [P-013]:** `quote_asset = USDT`, network-agnostic bir hesap birimidir; bu, USDT'nin bir **varlık** olarak (Sepolia USDT, Tron USDT — ayrı kontratlar) tutulmasından farklı bir kavramdır (bkz. [Terminoloji Kilidi](#terminoloji-kilidi)). Kodda da ayrı temsil edilir: `QuoteCurrency.USDT` (sabit, tekil) vs `Asset { symbol: 'USDT', networkId }` (çoğul, kontrat bazlı).

**Karar [P-014]:** USDT peg'i **sabit kabul edilmez**; `ETH/USDT = (ETH/USD) ÷ (USDT/USD)` şeklinde canlı fiyatlardan türetilir [cross-ref [I-010](#12-entegrasyonlar)].

**Karar [P-015] (kritik):** Sayısal tip disiplini — zincir bakiyeleri en küçük birimde (`wei`, `sun`) `BigInt`/string olarak saklanır, **asla float'a çevrilmez.** Değerleme `DECIMAL(38,18)` gibi sabit hassasiyetle tutulur, JS `number`'a düşürülmez. Bu kural agent kuralı olarak §17'de de tekrarlanır [cross-ref [CODE-004](#17-kod-organizasyonu-ve-agent-kuralları)].

**Karar [P-016]:** Portföy snapshot'ına o anki fiyat + kaynak + zaman damgası yazılır; geçmiş grafik bu snapshot'lardan okunur, yeniden hesaplanmaz.

**Karar [P-017]:** UI'da her zaman "testnet varlıkları — gösterge değerdir" ibaresi bulunur.

---

## 2. Kullanıcı Havuzu ve Ölçek

**Karar [S-001]:** Ölçek — demo/portföy projesi ölçeği; gerçek kullanıcı ve eşzamanlılık baskısı yoktur (birkaç manuel test kullanıcısı varsayılır). Altyapı bu ölçeğe göre boyutlandırılır [cross-ref [P-007](#1-proje-kimliği-ve-kapsam), [15. Altyapı ve Operasyon](#15-altyapı-ve-operasyon)].

**Karar [S-002]:** Coğrafya/regülasyon kısıtı yoktur; KVKK/GDPR kapsamı minimal tutulur (gerçek PII yok, sadece email + hash'lenmiş şifre) [cross-ref [SEC-003](#10-güvenlik-ve-kvkk)].

**Karar [S-003]:** Gerçek-zamanlılık — near-real-time yeterlidir (worker/polling/webhook tabanlı güncelleme). Sert real-time (sub-second websocket) gereksinimi yoktur [cross-ref [I-003](#12-entegrasyonlar), [N-003](#13-bildirim-sistemi)].

---

## 3. Kimlik Doğrulama ve Kullanıcı Yapısı

**Karar [A-001]:** Kimlik sağlayıcı — email + şifre (argon2id hash). OIDC/SSO MVP kapsamı dışıdır.

**Karar [A-002]:** Kullanıcı attribute'ları — `id, email, passwordHash, role, createdAt`. Ek gerçek-dünya PII (isim, adres, telefon) tutulmaz [cross-ref [SEC-003](#10-güvenlik-ve-kvkk)].

**Karar [A-003]:** Admin modeli — tek seviye `Admin` rolü (superadmin ayrımı yok); admin kullanıcı seed ile oluşturulur, uygulama içinden admin'e yükseltme akışı MVP'de yoktur.

**Karar [A-004]:** Network/Asset kataloğu **master data**'dır: `networks` ve `assets` tabloları, aralarında `(network_id, asset_id)` üzerinde `is_active` bayrağı taşıyan bir ilişki tutar. Sadece Admin panelinden yönetilir [cross-ref [AP-001](#9-admin-panelleri)]. Admin bir çifti aktifleştirmediyse kullanıcı o network/asset için **ne watch-only ne managed** cüzdan ekleyemez [cross-ref [AUTH-003](#4-yetkilendirme-mimarisi)].

**Karar [A-005]:** Login MFA MVP kapsamı dışıdır; ASVS L1 taban + §10'da L2'ye çıkan auth/session alt-kararları (brute-force koruma, session güvenliği) bununla yeterli kabul edilir. (Transfer-öncesi 2FA ayrı bir konu olup §18'de MVP-dışı açık madde olarak durur [SEC-OPEN-1].)

---

## 4. Yetkilendirme Mimarisi

**Karar [AUTH-001]:** Model — basit **RBAC** (`User` | `Admin`); ABAC gerekmez, iki rol proje kapsamını tam karşılıyor [cross-ref [5. Roller](#5-roller-ve-yetki-yönetimi)].

**Karar [AUTH-002]:** Zorlama katmanı — NestJS guard/decorator (`@Roles()`) her endpoint'te zorunludur; cüzdan/transfer kaynaklarında ayrıca **resource ownership** kontrolü yapılır (kullanıcı yalnızca kendi cüzdanlarını görür/yönetir).

**Karar [AUTH-003]:** Network/Asset aktivasyon kontrolü — cüzdan ekleme ve transfer başlatma endpoint'leri, hedef `(network, asset)` çiftinin `is_active = true` olduğunu **backend'de** doğrular. UI sadece aktif olanları listeler ama bu sadece UX'tir; backend tekrar kontrol eder (defense in depth) [cross-ref [A-004](#3-kimlik-doğrulama-ve-kullanıcı-yapısı)].

**Karar [AUTH-004] (kritik):** **Cross-network guard** — transfer yetkilendirme katmanında, gönderen cüzdanın `network_id`'si ile alıcı adresin beklenen network'ü backend'de karşılaştırılır. Uyuşmazlıkta transfer `draft` state'inden ileri geçemez. Bu kontrol **yalnızca backend'de** zorlanır; UI validasyonu tek başına yeterli sayılmaz [cross-ref [W-003](#6-süreç-workflow-mimarisi)].

---

## 5. Roller ve Yetki Yönetimi

**Karar [R-001]:** Sistem rolleri:
- **`User`** — kendi cüzdanlarını yönetir (watch-only ekler, managed cüzdan oluşturur), transfer başlatır.
- **`Admin`** — network/asset kataloğunu yönetir, mock token mint eder, tüm kullanıcıların cüzdan/transfer verisini salt-okunur görür (destek/denetim amaçlı).

**Karar [R-002]:** Rol ataması — kayıt olan her kullanıcı varsayılan `User` rolüyle başlar; `Admin` sadece seed/manuel DB müdahalesiyle atanır. Self-servis admin başvurusu yoktur.

---

## 6. Süreç (Workflow) Mimarisi

> Bu bölüm projenin kalbidir; her state machine kararı 4 katmanlı açıklanır: **Anlamı / Backend / Data / UI.**

### 6.1 Cüzdan ekleme akışı

**Karar [W-001]:** Cüzdan ekleme, ayrı bir state machine gerektirmeyen atomik bir akıştır:
- **Watch-only:** kullanıcı bir adres girer → backend, network'e bağlı formatı doğrular (**EVM:** `0x...` + EIP-55 checksum; **Tron:** `T...` + base58check — tek bir ortak regex kullanılmaz) → `(network, asset)` aktiflik kontrolü [AUTH-003] → kayıt.
- **Managed:** kullanıcı seçili network için "yeni cüzdan" ister → backend HD wallet'tan bir sonraki index'i türetir (`m/44'/<coinType>'/0'/0/<index>`) → private key üretilir, envelope encryption ile şifrelenir [cross-ref [SEC-OPEN-2](#18-açık-kararlar--tamamlanması-gerekenler)] → adres + şifreli key referansı `wallets` tablosuna yazılır.

### 6.2 Transfer state machine

**Karar [W-002] — Anlamı:**

| Durum | Anlamı |
| --- | --- |
| `draft` | Kullanıcı formu doldurdu (cüzdan, hedef adres, tutar), henüz onaylamadı. Zincire hiçbir şey gönderilmedi. |
| `pending_signature` | Kullanıcı onayladı; backend imzalama işini kuyruğa aldı. |
| `signed` | Raw transaction managed wallet private key'i ile imzalandı, henüz broadcast edilmedi. |
| `broadcast` | İmzalı tx `IChainProvider.broadcastTransaction()` ile ağa gönderildi, tx hash alındı, mempool'da. |
| `confirming` | Tx bir bloğa girdi ama ağın gerektirdiği N-blok eşiğine henüz ulaşmadı. |
| `confirmed` | N-blok confirmation eşiği geçildi — **terminal başarı.** |
| `failed` | Tx revert edildi veya broadcast reddedildi (yetersiz bakiye/gas) — **terminal başarısızlık.** |
| `dropped` | Tx mempool'dan düştü / süre içinde hiç bloğa girmedi — **terminal**, kullanıcıya yeniden deneme sunulur. |

**Karar [W-003] — Backend nasıl zorlar:**
- Tüm geçişler merkezi bir `TransferStateMachine` servisi üzerinden yapılır; state'e doğrudan `UPDATE` ile dokunulamaz.
- İzin verilen geçiş tablosu (whitelist) her denemede kontrol edilir; tanımsız geçiş `InvalidTransitionError` fırlatır ve audit'e yazılır [cross-ref [AUD-OPEN-1](#18-açık-kararlar--tamamlanması-gerekenler)].
- `draft → pending_signature`: cross-network guard [AUTH-004], `(network,asset)` aktiflik [AUTH-003], bakiye yeterliliği (DB cache + worker re-check) ve managed wallet sahiplik kontrolünden geçmeyen istekler ilerlemez.
- `pending_signature → signed`: BullMQ `signing` kuyruğundaki worker private key'i decrypt eder (**yalnızca bellekte, hiçbir log'a yazılmaz**), raw tx'i imzalar; başarısızsa `failed`.
- `signed → broadcast`: `IChainProvider.broadcastTransaction()` çağrılır; RPC hatasında (nonce/gas) `failed`; geçici ağ hatasında (timeout) exponential backoff ile retry, N deneme sonrası `failed` [cross-ref [I-006](#12-entegrasyonlar)].
- `broadcast → confirming`: confirmation worker tx hash'i izler, ilk bloğa girişte bu duruma geçer.
- `confirming → confirmed`: ağa özel N-blok eşiği geçildiğinde [cross-ref [I-004](#12-entegrasyonlar)].
- `confirming → dropped`: tx belirlenen süre içinde hiç bloğa girmediyse.
- `confirming → failed`: bloğa girdi ama execution revert etti (EVM) / `FAILED` sonucu döndü (Tron).
- Terminal durumlardan (`confirmed`/`failed`/`dropped`) **hiçbir geçiş yapılamaz**; worker'lar idempotent çalışır [cross-ref [I-005](#12-entegrasyonlar)].

**Karar [W-004] — Data modeli:**
- `transfers`: `id, walletId (FK, managed), networkId, assetId, toAddress, amount (string, en küçük birim), state (enum), txHash (nullable), failureReason (nullable), idempotencyKey (nullable), createdAt, updatedAt`. `idempotencyKey` istemci-tarafı idempotency içindir (`docs/03_API_CONTRACTS.md` §7): `(walletId, idempotencyKey)` UNIQUE, ayrı bir `idempotency_keys` tablosu açılmaz (kullanıcı-anahtar çifti zaten tek transfer'e 1-1 karşılık gelir — Faz 5 §5.1 skill üretiminde netleştirildi, bkz. Versiyon Geçmişi 0.6).
- `transfer_state_events` (append-only): `transferId, fromState, toState, occurredAt, actor ('user'|'system'|'worker:<name>'), metadata (json)` — state machine'in tam denetim izi, audit'in transfer alt-kümesi [cross-ref [11. Denetim](#11-denetim-audit-log)].
- `state` alanı Postgres enum tipindedir (application-layer geçiş mantığı korunur, DB sadece geçersiz string'i engeller).

**Karar [W-005] — UI:**
- Hareket geçmişinde 8 durum Türkçe badge ile gösterilir (ör. "Onay Bekliyor", "İmzalandı", "Ağa Gönderildi", "Onaylanıyor (3/12 blok)", "Tamamlandı", "Başarısız", "Düştü").
- `confirming` durumunda ilerleme "3/12 blok" şeklinde gösterilir.
- `failed`/`dropped` durumunda `failureReason` sadeleştirilmiş bir mesajla gösterilir (ham RPC hatası değil).
- Yalnızca `draft` state'indeki transfer kullanıcı tarafından silinebilir/vazgeçilebilir; diğer terminal-olmayan durumlarda iptal yoktur.

### 6.3 Hareket geçmişi ekranı

**Karar [W-006]:** İki kaynak birleşik listelenir, modelde ayrıdır:
1. **Zincir hareketleri** (`chain_movements`) — watch-only dahil tüm cüzdanlarda indexlenir, kaynak Alchemy/TronGrid [cross-ref [I-002](#12-entegrasyonlar)].
2. **Sistem içi transferler** (`transfers`) — zincir onaylamadan önce de listede görünür [W-004].

UI bu ikisini `occurredAt`/`createdAt` ile tek zaman çizelgesinde birleştirir, `source: 'chain' | 'system'` alanıyla ayırt eder. Bir sistem transferi `confirmed` olduğunda, aynı `txHash`'e sahip `chain_movements` kaydıyla eşleştirilip **tekilleştirilir** (aynı transfer iki kez görünmez).

**Karar [W-007]:** Filtreler — cüzdan, network, asset, yön (gelen/giden), tarih aralığı, durum. Her satırda tx hash + explorer linki (network'e göre) + o anki snapshot USDT değeri [cross-ref [P-016](#1-proje-kimliği-ve-kapsam)].

---

## 7. Görev Yönetimi

> ⚪ Bu bölüm proje sahibi talimatıyla kapsam dışı bırakıldı (gerekçe: insana atanan/SLA'lı/claim edilebilir bir iş kalemi yok; transfer onayı zincire bağlı makine sürecidir, bkz. [6. Süreç Mimarisi](#6-süreç-workflow-mimarisi)).

---

## 8. Doküman Yönetimi

> ⚪ Bu bölüm proje sahibi talimatıyla kapsam dışı bırakıldı (gerekçe: projede dosya yükleme yok).

---

## 9. Admin Panelleri

**Karar [AP-001]:** Network/Asset katalog yönetimi — Admin panelinden `(network, asset)` çiftleri eklenir/aktif-pasif yapılır. Pasif yapılan bir çiftte mevcut cüzdanlar salt-okunur kalır (bakiye görünür, yeni cüzdan/transfer engellenir) [cross-ref [A-004](#3-kimlik-doğrulama-ve-kullanıcı-yapısı), [AUTH-003](#4-yetkilendirme-mimarisi)].

**Karar [AP-002]:** Mock token yönetimi — Admin panelinden seçili bir kullanıcı cüzdanına mock ERC-20/TRC-20 test bakiyesi "mint" edilebilir (faucet benzeri). Bu işlem `transfers` kaydı değildir; ayrı bir `mint_operations` tablosunda loglanır [cross-ref [I-008](#12-entegrasyonlar)].

**Karar [AP-003]:** Kullanıcı/veri görünürlüğü — Admin tüm kullanıcıların cüzdan ve transfer listesini salt-okunur görebilir (destek/denetim amaçlı); private key'lere Admin panelinden **hiçbir şekilde** erişilemez, yalnızca sistem servisi decrypt eder [cross-ref [10. Güvenlik](#10-güvenlik-ve-kvkk)].

**Karar [AP-004] (ACTION-FIRST):** Admin ayrıca audit log ekranını salt-okunur görür (bkz. [§11](#11-denetim-audit-log)).

---

## 10. Güvenlik ve KVKK

> **Taban seviye onaylandı, alt-kararlar açık.** Aşağıdaki taban kararları onaylanmıştır; teknik alt-kararlar (key storage tasarımı, auth/session detayları, transfer yetkilendirme akışı, secrets/headers/input-validation) §18'de açık madde olarak durmaktadır ve ayrı bir onay turunda kapatılacaktır.

**Karar [SEC-001]:** Taban güvenlik seviyesi **OWASP ASVS L1**'dir. Gerekçe: testnet-only, yayına alınmayacak bir portföy/işe alım projesi.

**Karar [SEC-002]:** Üç alanda **L2**'ye çıkılır: (1) private key saklama ve kullanımı, (2) kimlik doğrulama ve session yönetimi, (3) transfer başlatma/yetkilendirme akışı. Gerekçe: sistem kullanıcı adına imza atabiliyor; bu üç alanda taban seviye savunulamaz.

**Karar [SEC-003]:** KVKK/GDPR kapsamı **minimal**dir — gerçek kullanıcı ve gerçek PII yok; saklanan kişisel veri yalnızca email + hash'lenmiş şifre [cross-ref [A-002](#3-kimlik-doğrulama-ve-kullanıcı-yapısı)]. Kurumsal veri işleme envanteri çıkarılmaz.

**Karar [SEC-004]:** Bankacılık seviyesi güvenlik / ISO 27001 / SOC2 **kapsam dışıdır.** Bu, agent'in ileride bu yönde kod/dokümantasyon üretmemesi için açık bir sınırdır.

**Karar [SEC-005]:** Testnet-only sınırı güvenlik kararı olarak burada tekrarlanır: sistemde mainnet RPC endpoint'i veya mainnet chain ID bulunmaz. `IChainProvider` başlatılırken chain ID allowlist kontrolü yapılır; allowlist dışı bir bağlantı reddedilir [cross-ref [P-003](#1-proje-kimliği-ve-kapsam), [I-001](#12-entegrasyonlar)].

**Karar [SEC-006]:** Key storage tasarımı — **envelope encryption, tek master key, iki ayrı kolon.** Her managed cüzdanın private key'i kendine özel bir DEK (Data Encryption Key) ile AES-256-GCM kullanılarak şifrelenir; bu ciphertext `wallets.encryptedPrivateKey` alanında saklanır. DEK'in kendisi bir master key (env/secret dosyasında tutulan, hiçbir zaman log'a yazılmayan `MASTER_ENCRYPTION_KEY`) ile ayrıca şifrelenip `wallets.encryptedDek` alanında saklanır — iki katman, iki kolon (`docs/02_DATABASE_SCHEMA.md` §2.5/§6; bu ikinci kolon Faz 4 skill üretimi sırasında şemada eksik olduğu tespit edilip eklenmiştir, bkz. Versiyon Geçmişi 0.5). Decrypt işlemi yalnızca imzalama worker'ının bellek-içi akışında yapılır, çözülmüş key hiçbir yere persist edilmez [cross-ref [W-003](#6-süreç-workflow-mimarisi), [CODE-004](#17-kod-organizasyonu-ve-agent-kuralları)]. Cloud KMS/HSM MVP kapsamı dışıdır (proje ölçeği için over-engineering).

**Karar [SEC-007]:** Auth/session tasarımı — **JWT access token (15 dk TTL) + httpOnly/secure refresh cookie (7 gün, rotating).** Access token frontend'de bellekte tutulur (localStorage'a yazılmaz — XSS riski); refresh her kullanımda invalidate edilip yenisi basılır (rotation + replay tespiti). Login endpoint'inde IP+email bazlı rate limiting (brute-force koruması) uygulanır (NestJS throttler). `secure` bayrağının varsayılanı `true`'dur; sistemin tek çalışma ortamı düz HTTP (`http://localhost`) olduğundan (bkz. `docs/09_DEV_WORKFLOW.md` §5, §7) bu, tarayıcının cookie'yi hiç geri göndermemesine yol açar — bu nedenle yeni bir `COOKIE_SECURE` env değişkeni (varsayılan/production-eşdeğeri davranış `true`, yalnızca yerel geliştiricinin `.env`'inde açıkça `false` yapılabilir) bayrağı kontrol eder; `NODE_ENV`'e bağlanmaz çünkü `NODE_ENV` yalnızca `development`/`test` değerlerini alır ve bir "production" dalı hiç oluşmaz [cross-ref [SEC-013](#10-güvenlik-ve-kvkk)].

**Karar [SEC-008]:** Transfer yetkilendirme akışı — **step-up auth.** `draft → pending_signature` geçişinde kullanıcı şifresini tekrar girer; backend bu şifreyi doğrulamadan geçişe izin vermez [cross-ref [W-003](#6-süreç-workflow-mimarisi), [AUTH-004](#4-yetkilendirme-mimarisi)]. Bu adım MVP-dışı bırakılan 2FA'dan [SEC-OPEN-1] farklıdır — TOTP/SMS gerektirmez, yalnızca re-authentication'dır.

**Karar [SEC-009] (ACTION-FIRST):** Secrets yönetimi — ortam değişkenleri (`.env`, `.gitignore`'da) local/demo ortamı için yeterlidir; deploy olmadığı için [INF-001] ayrı bir secret manager gerekmez.

**Karar [SEC-010] (ACTION-FIRST):** HTTP güvenlik başlıkları — NestJS `helmet` middleware (HSTS, CSP, X-Content-Type-Options vb.); CORS yalnızca frontend origin'ine izin verir; CSRF, `SameSite=Strict` refresh cookie + custom header kontrolü ile karşılanır.

**Karar [SEC-011] (ACTION-FIRST):** Input validation — NestJS `ValidationPipe` + zod/class-validator tabanlı DTO'lar her endpoint'te zorunludur (`whitelist:true, forbidNonWhitelisted:true`) [cross-ref [TS-005](#14-tech-stack)].

**Karar [SEC-012] (ACTION-FIRST):** Dependency taraması — `pnpm audit` + GitHub Dependabot yeterlidir; ayrı bir SAST aracı (Snyk vb.) MVP kapsamı dışıdır [cross-ref [SEC-OPEN-7](#18-açık-kararlar--tamamlanması-gerekenler)].

**Karar [SEC-013] (ACTION-FIRST):** Refresh token persistence şeması — [SEC-007]'de kararlaştırılan "DB'de tutulan, anında iptal edilebilir refresh token" davranışının somut şeması: `refresh_tokens { id, userId (FK → users, ON DELETE CASCADE), tokenHash, expiresAt, createdAt, revokedAt (nullable) }`. `tokenHash`, ham refresh token'ın **`JWT_REFRESH_SECRET` anahtarıyla HMAC-SHA256**'sıdır — `password_hash` gibi argon2id kullanılmaz, çünkü bu bir kullanıcı şifresi değil yüksek entropili rastgele bir token'dır ve doğrulama doğrudan hash eşleşmesiyle (lookup) yapılır; password hashing'in kasıtlı yavaşlığı burada gereksiz ve maliyetlidir. Düz SHA-256 yerine anahtarlı HMAC kullanılması, `docs/09_DEV_WORKFLOW.md` §7'de zaten tanımlı `JWT_REFRESH_SECRET` env değişkenine somut bir amaç kazandırır (yalnızca DB sızsa, anahtar sızmadıkça hash'ler ham token'a geri çevrilemez/taklit edilemez). Rotation, eski satırı silmek yerine `revokedAt = now()` ile bir "tombstone" bırakır ve yeni bir satır ekler (`network_assets.is_active`'e benzer şekilde teknik olarak güncellenebilir bir tablo, ama audit amaçlı değil). Zaten `revokedAt` dolu bir satır tekrar kullanılmaya çalışılırsa bu **replay** olarak yorumlanır ve o `userId`'ye ait, henüz `revokedAt`'ı boş olan **tüm** satırlar `revokedAt = now()` ile geçersiz kılınır [cross-ref [SEC-007](#10-güvenlik-ve-kvkk)]. Bir kullanıcının aynı anda birden fazla aktif satırı olabilir — bu, MVP'de zaten var olan çoklu cihaz/oturum desteğinin (ayrı bir "diğer cihazları çıkış yaptır" özelliği olmadan) doğal sonucudur.

---

## 11. Denetim (Audit Log)

**Karar [AUD-001] (ACTION-FIRST):** Loglanan olaylar — kullanıcı login/login-failed, transfer state geçişleri (zaten `transfer_state_events` tablosunda tutulur [cross-ref [W-004](#6-süreç-workflow-mimarisi)], audit'in bir alt-kümesidir), admin network/asset aktivasyon değişiklikleri [cross-ref [AP-001](#9-admin-panelleri)], admin mint işlemleri [cross-ref [I-008](#12-entegrasyonlar)], managed cüzdan oluşturma [cross-ref [W-001](#6-süreç-workflow-mimarisi)].

**Karar [AUD-002] (ACTION-FIRST):** Şema — `audit_logs { id, actorType ('user'|'admin'|'system'), actorId, action, entityType, entityId, metadata (json), createdAt }`.

**Karar [AUD-003]:** Tamper-evidence (chain-hash zinciri) MVP'de **yoktur** — yayına alınmayacak, gerçek kullanıcı olmayan bir demo projesinde bu kapsam over-engineering olur [cross-ref [AUD-OPEN-2](#18-açık-kararlar--tamamlanması-gerekenler)].

**Karar [AUD-004]:** Kim görür — yalnızca `Admin` rolü, salt-okunur ekrandan [cross-ref [AP-004](#9-admin-panelleri)].

**Karar [AUD-005] (ACTION-FIRST):** Retention — otomatik silme yoktur (demo veri seti küçük kalır).

---

## 12. Entegrasyonlar

**Karar [I-001]:** Chain provider soyutlaması — `IChainProvider` arayüzü + iki implementasyon: `EvmProvider` (ethers v6 — Sepolia ve BSC Testnet aynı kod) ve `TronProvider` (tronweb). Arayüz, BTC/XRP gibi UTXO/farklı-SDK zincirlerini ileride ekleyecek şekilde genişletilebilir tasarlanır [cross-ref [I-OPEN-1](#18-açık-kararlar--tamamlanması-gerekenler)].

**Karar [I-002]:** Veri kaynağı matrisi:

| İhtiyaç | EVM (Sepolia, BSC Testnet) | Tron Shasta |
| --- | --- | --- |
| Bakiye | RPC (`eth_getBalance`, `balanceOf`) | TronGrid |
| Hareket geçmişi | Alchemy `getAssetTransfers` | TronGrid TRC-20 transfer endpoint |
| Gelen transfer tespiti | Alchemy Webhook | TronGrid polling (webhook yok) |
| Giden tx onayı | kendi confirmation worker'ı, N blok | aynı worker |
| Fiyat | CoinGecko + cache | CoinGecko + cache |

**Karar [I-003]:** RPC **asla sayfa yüklemesinde çağrılmaz.** Bakiyeler DB'de cache'lenir, worker günceller, UI DB'den okur [cross-ref [S-003](#2-kullanıcı-havuzu-ve-ölçek)].

**Karar [I-004] (ACTION-FIRST — öneri, itiraz edersen değiştiririm):** Confirmation eşikleri — Sepolia **12 blok**, BSC Testnet **15 blok**, Tron Shasta **19 blok**.

**Karar [I-005]:** Idempotency — her worker job'u `(chain, txHash)` veya `(transferId, targetState)` bileşik anahtarıyla idempotent çalışır; BullMQ job id bu anahtardan türetilir. Terminal-durum kuralı [W-003] sayesinde tekrar işlense de yan etkisizdir.

**Karar [I-006]:** Retry/backoff — RPC/webhook çağrılarında exponential backoff (1s, 2s, 4s... maks. 5 deneme), BullMQ'nun yerleşik retry stratejisi kullanılır.

**Karar [I-007]:** Reorg toleransı — EVM tarafında confirmation eşiği [I-004] reorg riskini pratikte sıfırlar. Eşik altı derinlikte reorg tespit edilirse (block hash mismatch) ilgili transfer `confirming`'e geri alınır, sayaç sıfırlanmadan yeniden doğrulanır.

**Karar [I-008]:** Mock token stratejisi — kendi mock ERC-20 (Sepolia/BSC Testnet) ve mock TRC-20 (Tron Shasta) kontratları deploy edilir; kontrat adresleri `assets.contractAddress` alanına yazılır. Admin mint fonksiyonu [AP-002] bu kontratların `mint()` fonksiyonunu çağırır.

**Karar [I-009]:** Rate limit stratejisi — RPC/Alchemy/TronGrid/CoinGecko çağrıları merkezi bir rate-limiter (BullMQ concurrency limiti / `bottleneck`) arkasından yapılır; sağlayıcı bazlı eşikler config'den okunur.

**Karar [I-010]:** Fiyat kaynağı — CoinGecko API; testnet varlığının kendi fiyatı yoktur, mainnet sembolüne map'lenir (`sepolia:USDT → tether`, statik mapping tablosu `packages/types` içinde tutulur), sonuç 60 sn Redis cache'lenir [cross-ref [P-014](#1-proje-kimliği-ve-kapsam)].

---

## 13. Bildirim Sistemi

**Karar [N-001]:** Kanal — yalnızca **in-app**; email/SMS yok.

**Karar [N-002]:** Tetikleyici olaylar — tx confirmed, tx failed, gelen transfer tespit edildi.

**Karar [N-003] (ACTION-FIRST):** Delivery mekanizması — kısa aralıklı polling (frontend `/notifications` endpoint'ini periyodik çeker); websocket/SSE gerekmez çünkü ölçek küçük ve near-real-time yeterli [cross-ref [S-003](#2-kullanıcı-havuzu-ve-ölçek)].

**Karar [N-004]:** Data modeli — `notifications { userId, type, payload (json), readAt (nullable), createdAt }`. Retention: demo/gösterge amaçlı proje olduğu için otomatik silme yoktur.

---

## 14. Tech Stack

**Karar [TS-001]:** TypeScript monorepo (**Turborepo**), **Next.js App Router** (frontend) + **NestJS** (backend) + **PostgreSQL/Prisma** + **Redis/BullMQ** (kuyruk) + **ethers v6** (EVM) + **tronweb** (Tron), paylaşılan `packages/types`.

**Karar [TS-002]:** Confirmation worker ve bakiye senkronizasyonu **cron değil BullMQ kuyruğu** üzerinde çalışır [cross-ref [I-003](#12-entegrasyonlar)].

**Karar [TS-003] (ACTION-FIRST — versiyon pinleri, itiraz edersen düzeltirim):**

| Bileşen | Versiyon |
| --- | --- |
| Node.js | 22 LTS |
| TypeScript | ^5.7 |
| Next.js | ^15.1 (App Router) |
| NestJS | ^10.4 |
| PostgreSQL | 16 |
| Prisma | ^5.22 |
| Redis | 7.x |
| BullMQ | ^5.28 |
| ethers | ^6.13 |
| tronweb | ^5.3 |
| Turborepo | ^2.3 |
| pnpm | ^9.12 |
| zod | ^3.23 |
| TanStack Query | ^5.59 |
| Tailwind CSS | ^3.4 |

**Karar [TS-004] (ACTION-FIRST):** UI kit — Tailwind CSS + shadcn/ui (bileşen koleksiyonu, sabit versiyon takip edilmez, CLI ile projeye kopyalanır).

**Karar [TS-005] (ACTION-FIRST):** Validasyon — `zod`, hem backend DTO'larında hem frontend form validasyonunda ortak şema (`packages/types` üzerinden paylaşılır).

**Karar [TS-006] (ACTION-FIRST):** Sunucu state yönetimi — TanStack Query (DB-cache-okur mimariye uygun); client state ihtiyacı minimal, ek kütüphane gerekmedikçe React state yeterli.

**Karar [TS-007] (ACTION-FIRST):** API stili — REST (NestJS controller'lar). GraphQL projenin ölçeğine göre gereksiz karmaşıklık.

**Karar [TS-008]:** Mock kontrat deploy tooling'i — **Hardhat + TypeScript**, yeni bir `packages/contracts` workspace'i. `MockERC20.sol`, Hardhat/ethers ile Sepolia ve BSC Testnet'e deploy edilir; aynı derlenmiş bytecode/ABI, Tron Shasta'ya Hardhat'in dışında `tronweb`'in kendi deploy akışıyla (`tronWeb.contract().new()`) ayrı bir script'te deploy edilir — Hardhat Tron ağlarını desteklemez. Foundry (Rust tabanlı, monorepo'nun pnpm/TS akışına daha az entegre) ve framework'süz minimal `solc`+`ethers.ContractFactory` script'i (artifact/ABI yönetimi elle yapılır) değerlendirilip elenmiştir — gerekçe ve tam karşılaştırma `docs/adr/0001-mock-contract-tooling.md`'de [cross-ref [I-008](#12-entegrasyonlar), [CODE-001](#17-kod-organizasyonu-ve-agent-kuralları)].

> Not: Auth mekanizması (JWT/cookie, TTL, refresh) burada **kasıtlı olarak** belirlenmedi — bu bir güvenlik tasarım kararıdır, §10 alt-kararlarıyla birlikte kapatılacaktır [cross-ref [SEC-OPEN-3](#18-açık-kararlar--tamamlanması-gerekenler)].

---

## 15. Altyapı ve Operasyon

**Karar [INF-001]:** Deploy stratejisi — **sadece lokal Docker Compose**, hiçbir ortama deploy edilmez. `docker-compose.yml` ile Postgres + Redis + `apps/api` + `apps/web` tek komutla ayağa kalkar. Gerekçe: "yayına alınmayacak" kısıtıyla en tutarlı seçenek; deploy/hosting bakımı projenin amacına (portföy/işe alım) katkı sağlamıyor [cross-ref [P-007](#1-proje-kimliği-ve-kapsam), [SEC-009](#10-güvenlik-ve-kvkk)].

**Karar [INF-002] (ACTION-FIRST):** CI — GitHub Actions; her PR'da lint + typecheck + unit/integration test + build çalışır. Deploy adımı **yoktur** [cross-ref [INF-001](#15-altyapı-ve-operasyon)].

**Karar [INF-003] (ACTION-FIRST):** Log stratejisi — yapılandırılmış (structured) JSON log (`pino`), stdout'a yazılır; merkezi log toplama (ELK/Datadog vb.) MVP kapsamı dışıdır (deploy olmadığı için gerek yok).

**Karar [INF-004] (ACTION-FIRST):** Monitoring/alerting — MVP kapsamı dışıdır; local/demo ortamda gerek yoktur.

**Karar [INF-005] (ACTION-FIRST):** Backup/PITR — gerekmez; veri testnet-only ve tekrar üretilebilir (worker'lar zinciri yeniden indexler) [cross-ref [P-005](#1-proje-kimliği-ve-kapsam)].

**Karar [INF-006] (ACTION-FIRST):** Ortam izolasyonu — tek ortam (`local`/`.env.local`); `staging`/`production` ayrımı yoktur.

---

## 16. Test Stratejisi

**Karar [TEST-001] (ACTION-FIRST):** Test piramidi — unit testler (business logic, `TransferStateMachine`, chain provider adaptörleri) ağırlıklı; entegrasyon testleri (NestJS + test DB) kritik akışlar için (transfer state machine uçtan uca, auth); e2e (Playwright) yalnızca ana kullanıcı akışı için (login → cüzdan ekle → transfer başlat, 1-2 senaryo).

**Karar [TEST-002] (ACTION-FIRST):** Coverage hedefi — `packages/chain-providers` ve `TransferStateMachine` için **≥%80** unit coverage zorunlu; projenin geneline sert bir eşik konmaz (demo ölçeği, over-engineering'den kaçınma [cross-ref [P-007](#1-proje-kimliği-ve-kapsam)]).

**Karar [TEST-003]:** Chain provider testleri gerçek testnet'e karşı **değil**, mock/stub RPC yanıtlarıyla çalışır — deterministik ve hızlı CI [cross-ref [INF-002](#15-altyapı-ve-operasyon)].

**Karar [TEST-004]:** Agent kullanıcı onayı olmadan `main`'e merge etmez (standart kural) [cross-ref [CODE-004](#17-kod-organizasyonu-ve-agent-kuralları)].

**Karar [TEST-005] (ACTION-FIRST):** Seed stratejisi — yalnızca `local`/dev ortamı için seed script'i (örnek network/asset kataloğu + 1 admin + 1 demo user); prod seed'i yoktur (deploy zaten yok [INF-001]).

---

## 17. Kod Organizasyonu ve Agent Kuralları

**Karar [CODE-001] (ACTION-FIRST):** Monorepo yapısı:
```
apps/web              — Next.js App Router
apps/api               — NestJS
packages/types          — paylaşılan tipler / enum'lar / zod şemaları
packages/chain-providers — IChainProvider + EvmProvider + TronProvider
packages/config          — paylaşılan eslint/tsconfig
packages/contracts       — mock ERC-20/TRC-20 kontratları + Hardhat deploy script'leri (Faz 4 §4.4a; [TS-008](#14-tech-stack))
```

**Karar [CODE-002] (ACTION-FIRST):** Naming conventions — Klasör/dosya `kebab-case`, Class/Type `PascalCase`, fonksiyon/değişken `camelCase`, constant/enum `UPPER_SNAKE_CASE`, DB tablo `snake_case` çoğul.

**Karar [CODE-003] (ACTION-FIRST):** Commit formatı — Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`...).

**Karar [CODE-004]:** Agent'ın yapmaması gerekenler:
- Mainnet RPC/endpoint eklemez, chain ID allowlist'ini genişletmez [cross-ref [SEC-005](#10-güvenlik-ve-kvkk)].
- Zincir bakiyelerini/tutarlarını **asla** JS `number`'a çevirmez; `BigInt`/string ve `DECIMAL(38,18)` disiplinini korur [cross-ref [P-015](#1-proje-kimliği-ve-kapsam)].
- Private key'i log'a, response body'sine veya client'a **asla** yazmaz/döndürmez.
- `TransferStateMachine` servisi dışında transfer state'ini doğrudan güncellemez [cross-ref [W-003](#6-süreç-workflow-mimarisi)].
- Kullanıcı onayı olmadan `main`'e merge etmez [cross-ref [16. Test Stratejisi](#16-test-stratejisi)].
- UI'da `$` veya başka bir fiat sembolü kullanmaz; toplam değer her zaman "USDT" etiketiyle gösterilir [cross-ref [P-012](#1-proje-kimliği-ve-kapsam)].

**Karar [CODE-005] (ACTION-FIRST):** Her-feature kontrol listesi — tip kontrolü geçmeli, ilgili unit/integration testleri eklenmeli, gerekiyorsa migration yazılmalı; cross-network guard etkileniyorsa [AUTH-004] regresyon testi eklenmeli.

---

## 18. Açık Kararlar — Tamamlanması Gerekenler

Aşağıdaki kararlar henüz alınmamıştır. **Bu kararlar tamamlanmadan ilgili kod parçalarının geliştirilmesine başlanmamalıdır.**

- **[SEC-OPEN-1]** 🟠 Transfer öncesi 2FA (TOTP/SMS) — MVP dışı, MVP-sonrası değerlendirilecek. (Not: step-up auth [SEC-008] zaten var; bu madde onun ötesinde gerçek 2FA'yı kapsar.)
- **[SEC-OPEN-6]** 🟢 Otomatik master-key rotasyon zamanlayıcısı — MVP'de rotasyon manuel prosedürle yapılır [cross-ref [SEC-006](#10-güvenlik-ve-kvkk)]; otomatik zamanlanmış rotasyon MVP-sonrası.
- **[SEC-OPEN-7]** 🟢 SAST (Snyk vb.) gibi gelişmiş güvenlik tarama araçları — MVP'de `pnpm audit` + Dependabot yeterli kabul edildi [cross-ref [SEC-012](#10-güvenlik-ve-kvkk)].
- **[AUD-OPEN-2]** 🟢 Audit log tamper-evidence (chain-hash zinciri) — MVP'de yok [cross-ref [AUD-003](#11-denetim-audit-log)], MVP-sonrası değerlendirilecek.
- **[I-OPEN-1]** 🟢 BTC ve XRP desteği — MVP dışı; UTXO modeli ve ayrı SDK maliyeti nedeniyle parklandı. `IChainProvider` arayüzü bunları ileride ekleyecek şekilde tasarlanmalı [cross-ref [I-001](#12-entegrasyonlar)].

---

## Versiyon Geçmişi

| Versiyon | Tarih | Açıklama |
| --- | --- | --- |
| 0.1 | 2026-08-24 | İlk taslak (boş iskelet). |
| 0.2 | 2026-08-24 | Büyük ilk geçiş: §1(P-001..017), §2(S-001..003), §3(A-001..005), §4(AUTH-001..004), §5(R-001..002), §6(W-001..007), §9(AP-001..004), §10 taban (SEC-001..005), §12(I-001..010), §13(N-001..004), §14(TS-001..007), §17(CODE-001..005) yazıldı. §7 ve §8 kapsam dışı işaretlendi. §11/§15/§16 ve §10'un alt-kararları açık bırakıldı. SEC-OPEN-1 (2FA) ve I-OPEN-1 (BTC/XRP) MVP-dışı olarak parklandı. |
| 0.3 | 2026-08-24 | §10 alt-kararları kapatıldı: SEC-006 (key storage — envelope encryption/tek master key), SEC-007 (auth/session — JWT+refresh cookie), SEC-008 (transfer yetkilendirme — step-up auth/şifre tekrarı), SEC-009..012 (secrets/headers/input-validation/dependency tarama, ACTION-FIRST). §11 Audit (AUD-001..005), §15 Altyapı (INF-001..006 — sadece lokal Docker Compose, deploy yok), §16 Test (TEST-001..005) yazıldı. Kapanan: SEC-OPEN-2, SEC-OPEN-3, SEC-OPEN-4, SEC-OPEN-5, AUD-OPEN-1, INF-OPEN-1, TEST-OPEN-1. Yeni açılan (MVP-dışı, düşük öncelik): SEC-OPEN-6 (otomatik key rotasyonu), SEC-OPEN-7 (SAST aracı), AUD-OPEN-2 (audit tamper-evidence). Kalan açık: SEC-OPEN-1 (2FA), I-OPEN-1 (BTC/XRP). |
| 0.4 | 2026-08-26 | SEC-013 eklendi: SEC-007'nin varsaydığı "DB'de tutulan, anında iptal edilebilir refresh token" davranışının somut şeması (`refresh_tokens` tablosu, `JWT_REFRESH_SECRET` ile HMAC-SHA256 `tokenHash`, tombstone-tabanlı `revokedAt` ile rotation/replay tespiti). SEC-007'ye `COOKIE_SECURE` env bayrağı notu eklendi (sistemin tek ortamı düz HTTP olduğundan `secure` cookie bayrağının varsayılan `true` davranışının yalnızca dev'de bu bayrakla kapatılabileceği netleştirildi). Faz 1 (Kimlik Doğrulama ve Roller) skill'i üretilirken `docs/02_DATABASE_SCHEMA.md`'de bu tablonun ve `docs/09_DEV_WORKFLOW.md`'de bu env değişkeninin eksik olduğu tespit edildiği için eklendi — ikisi de SEC-006/SEC-007'de zaten karar verilmiş davranışın şema/config karşılığı olduğundan yeni bir mimari karar değil, mevcut kararların tamamlanmasıdır. |
| 0.6 | 2026-08-31 | W-004 netleştirildi: `transfers` tablosuna `idempotencyKey` (nullable) kolonu + `(walletId, idempotencyKey)` UNIQUE eklendi. Faz 5 §5.1 (Transfer şeması ve draft oluşturma) uygulanırken tespit edildi: `docs/03_API_CONTRACTS.md` §7 zaten zorunlu bir `Idempotency-Key` header'ı ve `(userId, idempotencyKey)` semantiğini tanımlıyordu, ama bu anahtarın nerede saklandığı şemada yoktu. Ayrı bir `idempotency_keys` tablosu değerlendirilip elendi (kullanıcı-anahtar çifti zaten tek transfer'e 1-1 karşılık geliyor — over-engineering, `.claude/rules/01`). `transfers`'ta ayrı `user_id` kolonu yok; sahiplik `wallet.user_id` join'iyle zorlanır. 24 saatlik TTL sorgu anında `created_at`'e göre değerlendirilir (cron yok); UNIQUE index eşzamanlı yarışa karşı backstop'tur (`P2002` → `200` + mevcut kayıt). Yeni bir mimari karar değil, §7'de zaten kararlaştırılmış davranışın şema karşılığının tamamlanmasıdır (SEC-013 / `encrypted_private_key` kalıbıyla aynı). `docs/02_DATABASE_SCHEMA.md` §2.7 + index listesi ve `docs/03_API_CONTRACTS.md` §7 güncellendi. |
| 0.5 | 2026-08-26 | TS-008 eklendi: mock kontrat deploy tooling'i (Hardhat + TypeScript, yeni `packages/contracts` workspace'i, Tron Shasta için ayrı `tronweb` deploy script'i) — Foundry ve framework'süz minimal script alternatifleri değerlendirilip elenmiştir, gerekçe `docs/adr/0001-mock-contract-tooling.md`'de. Faz 4 (Managed Cüzdan ve Key Storage) skill'i üretilirken tespit edildi: pinned tech stack'te (`.claude/rules/00-project-identity.md`) hiçbir Solidity tooling'i yoktu, ama `docs/10` §4.4 zaten mock kontrat deploy'unu gerektiriyordu — bu bir spec çelişkisi değil, eksik bir tech-stack kararıydı. Ayrıca aynı Faz 4 skill üretimi sırasında: (1) `docs/04_BACKEND_SPEC.md` §10 env tablosunda `HD_WALLET_MNEMONIC`'in ve `docs/07_SECURITY_IMPLEMENTATION.md` §9'da bu secret'ın eksik olduğu tespit edilip eklendi — W-001/SEC-006'da zaten karar verilmiş HD wallet türetme davranışının config/secret karşılığı; (2) **SEC-006 netleştirildi:** `docs/02_DATABASE_SCHEMA.md` §2.5 `wallets` tablosunda yalnızca `encrypted_dek` kolonu vardı, ama SEC-006/`docs/07` §5 metni iki katmanlı bir envelope encryption (private key → DEK → `encrypted_dek`) tarif ediyordu — private key'in DEK ile şifrelenmiş ciphertext'ini tutacak bir kolon şemada yoktu. Kullanıcı onayıyla yeni bir `wallets.encrypted_private_key` kolonu eklendi (additive migration, Faz 4 §4.2); alternatif olarak "private key hiç saklanmaz, imzalama anında HD'den yeniden türetilir" seçeneği değerlendirilip reddedildi. Bu, ikinci bir custody mimarisi kararı değil, SEC-006'nın zaten tarif ettiği tasarımın şemadaki eksik karşılığının tamamlanmasıdır. (3) `docs/03_API_CONTRACTS.md`'de S-ADMIN-MINT'in (`docs/06` S-ADMIN-MINT) bağımlı olduğu bir kullanıcı arama endpoint'i hiç tanımlanmamıştı — `GET /admin/users` eklendi (Faz 4 §4.4b), Faz 6'nın admin kullanıcı ekranları da bunu yeniden kullanabilir. Ayrıca S-ADMIN-MINT'in `docs/06`'da yanlışlıkla Faz 6 §6.4'e ait bir endpoint'e (`GET /admin/users/:userId/wallets`) referans verdiği görüldü; Faz 3 §3.4a'da zaten Admin-farkında (`?userId=`) teslim edilen `GET /wallets`'in aynı işlevi gördüğü tespit edilip `docs/06` bu şekilde düzeltildi — Faz 6 §6.4'ten hiçbir şey öne çekilmedi. |

---

## Nasıl Kullanılır?

Bu doküman **canlı bir dokümandır** — kararlar netleştikçe güncellenecektir. Her yeni karar için:

1. İlgili bölüme karar eklenir (Karar ID formatı: `[KATEGORI-SIRA]`).
2. Karar açıksa Bölüm 18'e `[KATEGORI-OPEN-N]` olarak öncelik etiketiyle yazılır; kapandığında listeden silinir.
3. Versiyon geçmişine not düşülür.

`docs/` dokümanları ve `.claude/rules/` kuralları oluşturulurken bu dokümandaki karar ID'leri **referans** olarak kullanılır. Böylece hiçbir kural boşlukta kalmaz, her kural bir mimari karara bağlıdır.

Pipeline: bu doküman → `project-doc-architect` (11 doküman) → `rules-architect` (`.claude/rules/` + `CLAUDE.md`) → `phase-creator` (faz skill'leri) → `phase-controller` (audit).
