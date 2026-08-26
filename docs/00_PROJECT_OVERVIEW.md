# 00. Proje Genel Bakış — Vault

## 1. Ürün Tanımı ve Değer Önerisi

Vault, bir kullanıcının testnet blok zinciri cüzdanlarını sisteme tanımlayıp mal varlığını tek ekranda takip edebildiği, görselleştirebildiği ve cüzdanlar arasında transfer başlatabildiği bir **portföy ve transfer uygulamasıdır.**

Vault bir **exchange değildir.** Swap, order book, matching engine, likidite havuzu ve fiat satın alma kapsam dışıdır. Sistemin desteklediği tek işlem türü, aynı varlığın aynı ağ (network) içinde bir adresten başka bir adrese transferidir (örnek: Sepolia ağındaki USDT'nin başka bir Sepolia adresine gönderilmesi). Farklı ağlar veya farklı varlıklar arasında dönüşüm/köprüleme yapılmaz.

Değer önerisi iki eksende kurulur:
- **Görünürlük:** Kullanıcı, birden fazla ağda dağılmış cüzdanlarındaki varlıkları kendi biriminde (ör. ETH 0.12, TRX 1200, USDT 500) ve toplamda tek bir USDT rakamıyla görür.
- **Kontrollü hareket:** Sistemin ürettiği (managed) cüzdanlardan, denetlenebilir bir durum makinesi (state machine) üzerinden, adım adım izlenebilir transferler başlatılabilir.

## 2. Ürün Modeli ve Platform Stratejisi

Vault bir **portföy/işe alım (recruitment) projesidir**; canlıya alınmayacak, gerçek kullanıcı trafiği almayacaktır. Ürün modeli çoklu kiracı (multi-tenant) bir SaaS değildir; tek bir uygulama örneği, sınırlı sayıda manuel test kullanıcısıyla çalışacak şekilde tasarlanır. Bu, altyapı ve operasyon kararlarının (bkz. §6 Kısıtlar) küçük ölçekte tutulmasının gerekçesidir.

Platform stratejisi tektir: yalnızca **responsive web** uygulaması geliştirilir. Native mobil uygulama (iOS/Android) MVP kapsamı dışıdır. Masaüstü ve mobil tarayıcılarda kullanılabilir olması responsive tasarımla sağlanır; ayrı bir mobil codebase veya hibrit çerçeve (React Native, Flutter vb.) planlanmaz.

Monetizasyon modeli yoktur. Vault demo/portföy amaçlı bir üründür; ücretlendirme, plan/paket ayrımı veya ödeme entegrasyonu tasarlanmaz.

## 3. Hedef Kullanıcı Profilleri ve Roller

Sistemde iki rol bulunur:

- **`User`:** Kayıt olan her kişi bu rolle başlar. Kendi watch-only ve managed cüzdanlarını yönetir, portföyünü görüntüler, transfer başlatır. Yalnızca kendi verisine erişir.
- **`Admin`:** Tek seviyeli bir yönetici rolüdür (superadmin ayrımı yoktur). Network/varlık kataloğunu yönetir, test amaçlı mock token dağıtır (mint), tüm kullanıcıların cüzdan ve transfer verisini salt-okunur olarak görür, audit log ekranına erişir. Admin rolü yalnızca seed veya doğrudan veritabanı müdahalesiyle atanır; uygulama içinden kendi kendine admin olma veya admin'e yükseltme akışı yoktur.

Rol ve yetki detayları, ekran bazlı erişim kuralları ve tam yetki matrisi bu dokümanın kapsamı dışındadır; bu üst düzey özet yeterlidir.

## 4. MVP Kapsamı

### Kapsam içi (in-scope)

- Email + şifre ile kimlik doğrulama (argon2id hash), rol tabanlı yetkilendirme (`User` / `Admin`).
- Watch-only cüzdan ekleme: kullanıcı harici bir adresi sisteme tanımlar, private key sistemde tutulmaz, yalnızca bakiye ve hareket geçmişi izlenir.
- Managed cüzdan oluşturma: sistem, kullanıcı için HD wallet türetir, private key'i şifreli saklar; yalnızca bu cüzdanlardan transfer başlatılabilir.
- Desteklenen ağlar: Sepolia, BSC Testnet (EVM tabanlı) ve Tron Shasta — hepsi **testnet.**
- Aynı ağ içinde adresten adrese transfer, uçtan uca durum makinesiyle izlenir (taslaktan zincir onayına kadar).
- Zincir hareketleri ve sistem içi transferlerin birleşik hareket geçmişi.
- Portföyün USDT cinsinden toplam değeri, canlı fiyat verisinden türetilerek gösterilir.
- Admin paneli: network/varlık kataloğu yönetimi, mock token mint işlemi, kullanıcı verisi salt-okunur görüntüleme, audit log görüntüleme.
- In-app bildirimler (tx onaylandı, tx başarısız, gelen transfer tespit edildi).
- Audit log (kullanıcı ve admin eylemleri, transfer durum geçişleri).
- Yalnızca lokal Docker Compose ile çalışan geliştirme/demo ortamı.

### Kapsam dışı (out-of-scope)

- Swap, order book, matching engine, likidite havuzu, fiat satın alma — Vault bir exchange değildir.
- Farklı ağlar veya farklı varlıklar arasında dönüşüm/köprüleme.
- Native mobil uygulama.
- Monetizasyon, ödeme/faturalama entegrasyonu.
- Mainnet bağlantısı — sistem hiçbir koşulda mainnet'e bağlanmaz; bu bir güvenlik sınırıdır, geçici bir eksiklik değildir.
- Gerçek transfer öncesi 2FA (TOTP/SMS). Bunun yerine, transfer başlatma akışında kullanıcının şifresini tekrar girdiği bir step-up authentication adımı zorunludur; bu, TOTP/SMS tabanlı gerçek 2FA'nın yerini tutmaz ve MVP sonrasına bırakılmıştır.
- BTC ve XRP ağ desteği — UTXO modeli ve ayrı SDK gereksinimi nedeniyle MVP dışıdır. Zincir sağlayıcı arayüzü bu ağları ileride ekleyecek şekilde genişletilebilir tasarlanır, ancak MVP'de yalnızca EVM tabanlı ağlar ve Tron desteklenir.
- Otomatik master-key rotasyon zamanlayıcısı — MVP'de key rotasyonu manuel prosedürle yapılır.
- Gelişmiş SAST güvenlik tarama araçları — MVP'de bağımlılık taraması `pnpm audit` ve Dependabot ile sınırlıdır.
- Audit log tamper-evidence (chain-hash zinciri) — MVP'de audit kayıtları değiştirilemezlik garantisi taşımaz.
- Görev yönetimi (insana atanan/SLA'lı iş kalemi akışı) — sistemde bu tür bir iş süreci yoktur; transfer onayı tamamen makine (zincir) sürecidir.
- Doküman yönetimi/dosya yükleme — sistemde herhangi bir dosya yükleme özelliği yoktur.
- Staging/production ortam ayrımı ve bulut dağıtımı — sistem yalnızca lokal Docker Compose ile çalışır, hiçbir ortama deploy edilmez.
- Merkezi log toplama, monitoring/alerting altyapısı, backup/PITR — deploy edilen bir ortam olmadığı için gerekmez.

## 5. Başarı Kriterleri

Vault canlıya alınmayacağı için başarı, kullanıcı büyümesi veya gelir gibi ürün metrikleriyle değil, mimari ve fonksiyonel bütünlükle ölçülür:

1. Kullanıcı, en az bir watch-only ve en az bir managed cüzdan ekleyip her ikisinde de bakiyesini USDT eşdeğeriyle görebiliyor.
2. Bir transfer, `draft` durumundan `confirmed` veya `failed`/`dropped` durumuna kadar, ara adımların hiçbiri atlanmadan izlenebiliyor; her geçiş `transfer_state_events` tablosunda denetlenebilir.
3. Cross-network guard (gönderen cüzdan ağı ile hedef adresin beklenen ağı arasındaki tutarsızlık kontrolü) yalnızca frontend değil, backend'de de zorunlu kılınmış durumda; bu kontrolün backend'de çalıştığı otomatik testle kanıtlanabiliyor.
4. Sistemde mainnet chain ID'sine bağlanmayı sağlayacak hiçbir kod yolu yok; allowlist dışı bir bağlantı denemesi reddediliyor.
5. `packages/chain-providers` ve transfer durum makinesi servisi için birim test kapsamı %80 ve üzerinde.
6. Admin, kendi rolünün izin verdiği eylemleri (network/varlık aktivasyonu, mock mint, salt-okunur veri görüntüleme) yapabiliyor; private key'e admin panelinden hiçbir şekilde erişilemiyor.
7. `docker-compose up` ile tüm sistem (Postgres, Redis, API, web) tek komutla ayağa kalkıyor.

## 6. Kısıtlar

- **Ölçek kısıtı:** Sistem, birkaç manuel test kullanıcısı varsayımıyla tasarlanır; eşzamanlılık veya yük altında performans optimizasyonu hedeflenmez. Bu kısıt, altyapı ve operasyon kararlarını doğrudan şekillendirir (deploy yok, monitoring yok, otomatik ölçekleme yok).
- **Over-engineering yasağı:** Proje bir işe alım/portföy projesidir; ölçeğin gerektirmediği karmaşıklık (mikroservis parçalanması, çoklu bölge dağıtımı, gelişmiş güvenlik araçları) eklenmez. Bununla birlikte mimari olgunluk korunur: katmanlar ayrıştırılmış olmalı, durum makinesi merkezi bir serviste yönetilmeli, zincir sağlayıcılar bir arayüz arkasında soyutlanmalıdır.
- **Testnet-only kısıtı:** Sistem hiçbir koşulda mainnet'e bağlanamaz. Bu, kod seviyesinde bir chain ID allowlist ile zorlanan sabit bir güvenlik sınırıdır; custody tasarımı da bu kısıtla uyumlu olacak şekilde testnet ölçeğinde tutulur ve mainnet'e taşınabilir olması hedeflenmez.
- **Regülasyon kısıtı yok:** Gerçek kullanıcı ve gerçek kişisel veri (PII) bulunmadığından coğrafi veya sektörel regülasyon kısıtı (bankacılık lisansı, KVKK/GDPR tam kapsamlı uyum, ISO 27001, SOC2) uygulanmaz. Saklanan tek kişisel veri email adresi ve hash'lenmiş şifredir.
- **Süre/bütçe kısıtı:** Ayrı bir hosting/altyapı bütçesi yoktur; geliştirme ve demo tamamen lokal ortamda yürütülür.
- **Mevcut sistem kısıtı yok:** Vault sıfırdan geliştirilen bağımsız bir projedir; entegre olması gereken mevcut bir kurumsal sistem yoktur.

## 7. Dil ve Yerelleştirme Politikası

Kullanıcı arayüzündeki tüm metinler **Türkçedir** (etiket, buton, hata mesajı, bildirim metni). Kod tanımlayıcıları — değişken adı, fonksiyon adı, veritabanı tablo/kolon adı, enum değeri, API path segmenti — **İngilizcedir.**

Para birimi gösterimi tek bir kurala bağlıdır: toplam portföy değeri her zaman **USDT** cinsinden gösterilir; arayüzün hiçbir yerinde `$` veya başka bir fiat sembolü kullanılmaz. USDT burada network-agnostic bir hesap birimidir, belirli bir ağdaki bir token kontratı değildir — bu ayrım şu şekilde netleştirilir: hesap birimi olarak USDT tekil ve sabittir, varlık olarak USDT ise her ağda ayrı bir kontrata sahiptir (ör. Sepolia USDT ile Tron USDT farklı token'lardır ve arayüzde ayrı satırlarda gösterilir).

Ek olarak, arayüzde her zaman "testnet varlıkları — gösterge değerdir" ibaresi bulunur; bu, kullanıcıya gösterilen bakiye ve değerlerin gerçek parasal karşılığı olmadığını açıkça belirtir.
