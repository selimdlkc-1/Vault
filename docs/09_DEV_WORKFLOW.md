# 09. Geliştirme İş Akışı — Vault

## İçindekiler

1. Branch Stratejisi ve Adlandırma
2. Commit Standardı
3. PR Süreci ve Zorunlu Kontroller
4. Agent Kuralları — Onaysız Merge Yasağı
5. Ortamlar ve İzolasyon
6. Local Kurulum Adımları
7. Env Değişkenleri ve Secret Temini
8. Release ve Rollback Prosedürü

---

## 1. Branch Stratejisi ve Adlandırma

Tek uzun ömürlü dal vardır: `main`. Her değişiklik, `main`'den açılan kısa ömürlü bir feature branch üzerinde yapılır ve PR ile geri birleştirilir; doğrudan `main`'e commit atılmaz.

**Branch adlandırma:** `<tip>/<kısa-açıklama>` — `tip`, Conventional Commits tipleriyle aynıdır (`feat`, `fix`, `chore`, `refactor`, `test`, `docs`). Örnekler: `feat/managed-wallet-creation`, `fix/cross-network-guard-validation`, `refactor/transfer-state-machine`. Açıklama kebab-case, İngilizce yazılır (kod tanımlayıcıları politikasıyla tutarlı).

Bir branch, tek bir mantıksal değişikliği (bir faz alt maddesi veya tek bir bugfix) kapsar; birden fazla ilgisiz değişikliği aynı branch'te biriktirmek yapılmaz — bu, PR review'unu ve olası bir revert'i zorlaştırır.

**Bootstrap istisnası:** Reponun ilk commit'i (`git init` + o ana kadar üretilmiş `docs/`, `.claude/`, `CLAUDE.md` dosyalarının eklenmesi) branch/PR akışı henüz mümkün olmadığından (`main` yoktur) doğrudan `main`'e atılır. Bu, yalnızca bir kerelik bir istisnadır — bu commit'ten sonraki her değişiklik §1'in geri kalanındaki normal feature-branch/PR akışını izler.

---

## 2. Commit Standardı

**Conventional Commits** kullanılır: `<tip>(<kapsam>): <açıklama>`.

**Tipler:** `feat` (yeni özellik), `fix` (hata düzeltmesi), `chore` (bakım, bağımlılık güncelleme), `refactor` (davranış değişmeyen yeniden yapılandırma), `test` (yalnızca test ekleme/düzenleme), `docs` (yalnızca doküman değişikliği).

**Kapsam (scope) adları** proje modülleriyle hizalıdır: `auth`, `wallets`, `transfers`, `movements`, `portfolio`, `notifications`, `admin`, `chain-providers`, `db` (migration/şema), `ci`.

Örnekler:
```
feat(transfers): add cross-network guard to confirm endpoint
fix(chain-providers): correct EIP-55 checksum validation for Sepolia
refactor(transfer-state-machine): extract terminal-state check into guard
docs(security): document envelope encryption key rotation procedure
```

Commit mesajı gövdesi (body), değişikliğin *neden* yapıldığını açıklar — *ne* değiştiğini diff zaten gösterir; body yalnızca non-obvious bir gerekçe varsa eklenir, her commit'te zorunlu değildir.

---

## 3. PR Süreci ve Zorunlu Kontroller

Her PR, açıldığında otomatik olarak CI'ı tetikler: lint → typecheck → unit/integration testler → build. Bu dört adımın tamamı yeşil olmadan bir PR merge edilemez — GitHub branch protection kuralı bunu teknik olarak da zorlar, yalnızca bir süreç kuralı değildir.

**PR açıklaması** şunları içerir: değişikliğin kısa özeti, ilgili faz/alt madde referansı (varsa), etkilenen modüller, test edildiyse nasıl test edildiği. Şema değişikliği içeren bir PR, migration dosyasının adını ve geri alma etkisini açıkça belirtir.

**Review beklentisi:** Proje bir kişilik/demo geliştirme sürecinde bile, bir PR'ın kendi kendine onaylanıp merge edilmemesi ilke olarak korunur — bir agent oturumunun ürettiği değişiklik, oturumu başlatan kullanıcının açık onayı olmadan `main`'e alınmaz (bkz. §4).

**Küçük PR ilkesi:** Bir PR, tek bir faz alt maddesini (§10 Implementation Roadmap'teki `§N.M` birimini) karşılar; birden fazla alt maddeyi tek PR'da biriktirmek, hem review'u hem olası bir revert'i zorlaştırdığından yapılmaz.

---

## 4. Agent Kuralları — Onaysız Merge Yasağı

**Kesin kural: Hiçbir agent oturumu, kullanıcının açık onayı olmadan bir branch'i `main`'e merge etmez.** Bu, projenin standart bir güvenlik/kalite kapısıdır ve şu şekilde işler:

1. Agent bir değişikliği tamamlar, kendi branch'inde commit'ler, testleri (varsa lokal olarak) çalıştırır.
2. Agent bir PR açar (veya kullanıcıya PR açmasını önerir) ve değişikliği özetler.
3. Kullanıcı değişikliği inceler ve **açıkça onay verir** ("merge et", "onaylıyorum" gibi bir ifadeyle).
4. Yalnızca bu onaydan sonra merge gerçekleşir.

Bu kural, CI'ın yeşil olmasından bağımsızdır — CI geçmesi teknik bir ön koşuldur, insan onayının yerine geçmez. Bir agent, "testler geçti, otomatik merge ediyorum" gibi bir gerekçeyle bu adımı atlamaz.

Aynı ilke, kritik modüllerde (`TransferStateMachine`, `packages/chain-providers`, envelope encryption servisi, cross-network guard) yapılan her değişiklik için ayrıca güçlendirilir: bu modüllerdeki bir değişiklik, ilgili negatif/deny senaryo testlerinin (test stratejisinde tanımlı zorunlu senaryolar) regresyon olarak eklendiğinden veya hâlâ geçtiğinden kullanıcıya PR açıklamasında ayrıca teyit edilir.

---

## 5. Ortamlar ve İzolasyon

**Tek ortam: `local`.** `staging` ve `production` ayrımı yoktur — proje hiçbir ortama deploy edilmez, sistem yalnızca geliştiricinin kendi makinesinde Docker Compose ile çalışır. `NODE_ENV` yalnızca `development` ve `test` değerlerini alır; `production` değeri hiçbir yerde kullanılmaz.

**İzolasyon:** Geliştirme ve test veritabanları birbirinden ayrıdır — `docker-compose.yml`'de tanımlı Postgres instance'ı geliştirme için, CI'ın kendi ayağa kaldırdığı ayrı bir Postgres container'ı testler için kullanılır; ikisi asla aynı veritabanını paylaşmaz. Bu, test çalıştırmalarının geliştirme sırasında biriktirilen manuel/seed verisini bozmasını engeller.

Birden fazla geliştiricinin (veya birden fazla agent oturumunun) aynı anda çalışması durumunda, her biri kendi lokal Docker Compose instance'ında izole çalışır; ortamlar arası bir paylaşılan durum (shared state) yoktur.

---

## 6. Local Kurulum Adımları

1. Depoyu klonla, `pnpm install` ile tüm workspace bağımlılıklarını kur (Turborepo monorepo, tek kök `pnpm-lock.yaml`).
2. `apps/api/.env.example` dosyasını `apps/api/.env` olarak kopyala, gerekli değerleri doldur (bkz. §7).
3. `docker-compose up -d` ile Postgres, Redis, `apps/api`, `apps/web` konteynerlerini ayağa kaldır — API konteyneri başlangıçta otomatik olarak `prisma migrate deploy` çalıştırır.
4. `pnpm --filter api run seed` ile master data (network/asset kataloğu), 1 admin ve 1 demo kullanıcı seed'i çalıştırılır (idempotent; tekrar çalıştırılabilir).
5. `apps/web` `http://localhost:3000` üzerinde, `apps/api` `http://localhost:3001` üzerinde (veya `.env`'de tanımlı portlarda) erişilebilir olur.
6. Seed'in oluşturduğu demo kullanıcı bilgileriyle (`seed.ts` içinde tanımlı sabit email/şifre) `/login`'den giriş yapılabilir.
7. **Yalnızca bir kez (veya testnet reset sonrası tekrar):** `packages/contracts/.env.example`'ı kopyalayıp doldur, `pnpm --filter contracts run deploy:evm` ve `pnpm --filter contracts run deploy:tron` ile mock ERC-20/TRC-20 kontratlarını üç ağa deploy et, üretilen adresleri `assets.contract_address`'e yaz (`docs/10_IMPLEMENTATION_ROADMAP.md` §4.4a). Bu, `apps/api`'nin kendi `.env`'inden **ayrı** bir kurulum adımıdır — `packages/contracts` kendi secret'larını (`CONTRACT_DEPLOYER_PRIVATE_KEY` vb.) kendi `.env`'inde tutar, `apps/api`'nin env şemasına dahil değildir.

Tüm sistemin tek komutla (`docker-compose up`) ayağa kalkması, projenin temel bir başarı kriteridir — yeni bir geliştirici veya agent oturumu, ek manuel adım gerektirmeden birkaç dakika içinde çalışan bir ortama sahip olabilmelidir.

---

## 7. Env Değişkenleri ve Secret Temini

Env değişkenleri `apps/api/.env` dosyasında tutulur (`.gitignore`'da); uygulama başlangıcında bir zod şeması tüm değişkenleri doğrular, eksik/geçersiz bir değişken varsa uygulama başlamaz. Tam liste ve nereden temin edileceği:

| Değişken | Temin yolu |
| --- | --- |
| `DATABASE_URL`, `REDIS_URL` | Docker Compose'un ürettiği sabit lokal bağlantı string'leridir, dışarıdan temin gerekmez. |
| `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_TTL` | Secret değerler geliştirici kendi makinesinde rastgele üretir (ör. `openssl rand -hex 32`); TTL değerleri sabit (`15m`, `7d`) bırakılır. |
| `MASTER_ENCRYPTION_KEY` | Geliştirici kendi makinesinde rastgele üretir; paylaşılan bir sabit değer değildir, her geliştirici ortamı kendi anahtarını taşır. |
| `HD_WALLET_MNEMONIC` | Geliştirici kendi makinesinde rastgele bir BIP-39 mnemonic üretir (ör. `ethers.Wallet.createRandom().mnemonic.phrase`); `MASTER_ENCRYPTION_KEY` kadar kritik, paylaşılan bir sabit değer değildir. |
| `MINT_OPERATOR_PRIVATE_KEY` | `packages/contracts/.env`'deki `CONTRACT_DEPLOYER_PRIVATE_KEY` ile aynı değer olmalıdır (İterasyon 4'te deploy eden cüzdan, kontratın `onlyOwner`'ıdır) — testnet faucet'inden fonlanmış bir geliştirme cüzdanı, gerçek değeri taşımaz. |
| `SEPOLIA_RPC_URL`, `BSC_TESTNET_RPC_URL` | Bir RPC sağlayıcısından (Alchemy, Infura vb.) ücretsiz bir geliştirici hesabıyla alınan testnet endpoint URL'leridir. |
| `TRON_SHASTA_RPC_URL` | TronGrid'in Shasta testnet endpoint'i; genellikle public bir URL'dir, yüksek hacimli kullanım için ayrı bir API key gerekebilir. |
| `ALCHEMY_API_KEY`, `ALCHEMY_WEBHOOK_SIGNING_KEY` | Alchemy hesabı üzerinden bir uygulama (app) oluşturulup elde edilir; webhook signing key, webhook oluşturulurken Alchemy panelinden alınır. |
| `TRONGRID_API_KEY` | TronGrid geliştirici portalından ücretsiz bir hesapla alınır. |
| `COINGECKO_API_KEY` | CoinGecko public API tier'ı için boş bırakılabilir; yüksek hacimli kullanım gerekiyorsa ücretli bir plan anahtarı girilir. |
| `CHAIN_ID_ALLOWLIST` | Sabit değer (`11155111,97,shasta` — `networks.chain_id` biçimiyle aynı), dışarıdan temin gerekmez — bu liste genişletilmez. |
| `CORS_ORIGIN` | Sabit lokal değer (`http://localhost:3000`), dışarıdan temin gerekmez. |
| `NODE_ENV`, `LOG_LEVEL` | Sabit değerler (`development`, `info`), dışarıdan temin gerekmez. |
| `COOKIE_SECURE` | Sabit lokal değer (`false`) — sistem tek ortamda (düz `http://localhost`) çalıştığından refresh cookie'nin `secure` bayrağı bu değişkenle kontrol edilir; varsayılan/güvenli davranış `true`'dur, yalnızca bu açık bayrakla dev'de kapatılabilir (bkz. `mimari-kararlar.md` SEC-013). |

Hiçbir gerçek secret değeri bu dokümanda veya `.env.example`'da yer almaz; `.env.example` yalnızca değişken adlarını ve (varsa) placeholder formatını listeler.

---

## 8. Release ve Rollback Prosedürü

Sistem hiçbir ortama deploy edilmediğinden, klasik anlamda bir "production release" süreci yoktur. Bu dokümanda "release", **bir değişikliğin `main`'e kabul edilmesi** anlamına gelir; "rollback" ise o değişikliğin geri alınması anlamına gelir.

**Release:** Bir PR, §3'teki CI gate'i geçip §4'teki kullanıcı onayını aldıktan sonra `main`'e merge edilir. Merge, "squash and merge" stratejisiyle yapılır — feature branch'teki ara commit'ler tek bir temiz commit'e sıkıştırılır, `main`'in geçmişi okunabilir kalır.

**Rollback (kod):** `main`'e alınmış bir değişiklik sorunlu çıkarsa, `git revert` ile geri alınır (commit geçmişi yeniden yazılmaz, force-push yapılmaz); bu yeni bir commit olarak `main`'e eklenir ve aynı CI gate'inden geçer.

**Rollback (migration):** Bir migration'ın veritabanı şemasında yarattığı değişiklik sorunluysa, migration dosyasının kendisi düzenlenmez — bir kez `main`'e merge edilmiş bir migration immutable kabul edilir, dosya düzeyinde geriye dönük düzenlenmez veya silinmez; bunun yerine sorunu düzelten **yeni bir migration** eklenir (`fix_<açıklama>` adıyla). Yalnızca henüz merge edilmemiş, geliştiricinin kendi branch'inde ürettiği migration'lar `prisma migrate reset` ile tamamen geri alınabilir.

Deploy adımı olmadığından, bir "production'da rollback" senaryosu (ör. mavi-yeşil geçiş, canary release geri alma) bu projede uygulanamaz ve tasarlanmaz.