/**
 * Merkezi TR metin sözlüğü (docs/05_FRONTEND_SPEC.md §10). Bileşenler sabit
 * string'i doğrudan JSX'e yazmaz, bu obje üzerinden referans alır.
 *
 * `errorByCode` — backend `error.code` (`docs/03_API_CONTRACTS.md` §3) → kullanıcıya
 * gösterilecek TR metin. Kod eşleşmezse `error.message` (zaten TR döner) kullanılır.
 */
export const messages = {
  common: {
    genericError: "Bir şeyler ters gitti. Lütfen tekrar deneyin.",
    retry: "Tekrar Dene",
    loading: "Yükleniyor...",
    copy: "Kopyala",
    copied: "Kopyalandı",
  },
  auth: {
    loginTitle: "Giriş Yap",
    registerTitle: "Kayıt Ol",
    email: "E-posta",
    password: "Şifre",
    passwordConfirm: "Şifre (tekrar)",
    loginSubmit: "Giriş Yap",
    loginSubmitting: "Giriş yapılıyor...",
    registerSubmit: "Kayıt Ol",
    registerSubmitting: "Kayıt oluşturuluyor...",
    toRegister: "Hesabın yok mu? Kayıt ol",
    toLogin: "Zaten hesabın var mı? Giriş yap",
    passwordMismatch: "Şifreler eşleşmiyor.",
  },
  session: {
    expiredTitle: "Oturum süresi doldu",
    expiredBody:
      "Güvenliğiniz için oturumunuz sonlandırıldı. Devam etmek için tekrar giriş yapın.",
    expiredConfirm: "Tamam, giriş yap",
    logoutTitle: "Çıkış yapmak istediğinize emin misiniz?",
    logoutConfirm: "Çıkış Yap",
    logoutCancel: "Vazgeç",
  },
  dashboard: {
    logout: "Çıkış Yap",
    // TR metinler docs/06_SCREEN_CATALOG.md §4.2 S-DASHBOARD'dan birebir.
    totalValueLabel: "Toplam Portföy Değeri",
    addWallet: "Cüzdan Ekle",
    empty: "Henüz bir cüzdanınız yok. Başlamak için bir cüzdan ekleyin.",
    loadError: "Portföy verisi yüklenemedi.",
    walletDistributionTitle: "Cüzdan Bazlı Varlık Dağılımı",
    historyTitle: "Portföy Geçmişi",
    historyEmpty: "Geçmiş grafiği için henüz yeterli veri yok.",
    historyError: "Portföy geçmişi yüklenemedi.",
    rangeLabels: { d7: "7 Gün", d30: "30 Gün", d90: "90 Gün" },
  },
  // `(authenticated)` layout nav bar (docs/05_FRONTEND_SPEC.md §2 layout hiyerarşisi).
  nav: {
    dashboard: "Dashboard",
    wallets: "Cüzdanlarım",
    movements: "Hareketler",
    notificationsAriaLabel: "Bildirimler",
  },
  wallets: {
    // TR metinler docs/06_SCREEN_CATALOG.md §4.2 S-WALLET-LIST'ten birebir.
    title: "Cüzdanlarım",
    addWallet: "Cüzdan Ekle",
    empty: "Henüz bir cüzdanınız yok.",
    loadError: "Cüzdanlar yüklenemedi.",
    typeWatchOnly: "İzleme",
    typeManaged: "Yönetilen",
    networkFilterLabel: "Ağ filtresi",
    typeFilterLabel: "Tip filtresi",
    filterAll: "Tümü",
    columnNetwork: "Ağ",
    columnType: "Tip",
    columnAddress: "Adres",
    columnValue: "Toplam Değer",
  },
  walletDetail: {
    // TR metinler docs/06_SCREEN_CATALOG.md §4.2 S-WALLET-DETAIL'den birebir.
    title: "Cüzdan Detayı",
    networkLabel: "Ağ",
    typeLabel: "Tip",
    addressLabel: "Adres",
    copyAddress: "Adresi Kopyala",
    copied: "Adres kopyalandı",
    sendTransfer: "Transfer Gönder",
    seeAllMovements: "Tüm Hareketleri Gör",
    balancesTitle: "Varlıklar",
    columnAsset: "Varlık",
    columnAmount: "Miktar",
    columnValue: "USDT Karşılığı",
    movementsTitle: "Son Hareketler",
    balancesEmpty: "Bu cüzdanda henüz bir varlık bulunmuyor.",
    movementsEmpty: "Bu cüzdan için henüz zincir hareketi indexlenmedi.",
    loadError: "Cüzdan bilgisi yüklenemedi.",
    notFound: "Cüzdan bulunamadı.",
    backToList: "Cüzdanlarıma dön",
  },
  walletAdd: {
    // TR metinler docs/06_SCREEN_CATALOG.md §4.2 S-WALLET-ADD-WATCHONLY'den birebir.
    watchOnlyTitle: "İzleme Cüzdanı Ekle",
    networkLabel: "Ağ",
    networkPlaceholder: "Ağ seçin",
    addressLabel: "Adres",
    submit: "Cüzdanı Ekle",
    submitting: "Ekleniyor...",
    cancel: "Vazgeç",
    // Tip seçim ekranı (docs/06 §4.2 tam ekran akış diyagramı "Tip seçimi" düğümü).
    choiceTitle: "Cüzdan Ekle",
    choiceWatchOnlyTitle: "İzleme Cüzdanı",
    choiceWatchOnlyDesc:
      "Harici bir adresi yalnızca bakiye ve hareket takibi için ekleyin.",
    choiceManagedTitle: "Yönetilen Cüzdan",
    choiceManagedDesc:
      "Sistemin sizin için yeni bir cüzdan türetmesine ve transfer yapabilmenize izin verin.",
    // TR metinler docs/06_SCREEN_CATALOG.md §4.2 S-WALLET-ADD-MANAGED'den birebir.
    managedTitle: "Yönetilen Cüzdan Oluştur",
    managedSubmit: "Cüzdan Oluştur",
    managedSubmitting: "Oluşturuluyor...",
    managedCreatedToast: "Yönetilen cüzdanınız oluşturuldu.",
  },
  movements: {
    // TR metinler docs/06_SCREEN_CATALOG.md §4.3 S-MOVEMENTS'ten birebir.
    title: "Hareketler",
    // Filtre alanları (docs/06 §4.3 alan listesi).
    filterWalletLabel: "Cüzdan",
    filterNetworkLabel: "Ağ",
    filterAssetLabel: "Varlık",
    filterDirectionLabel: "Yön",
    filterDateFromLabel: "Başlangıç",
    filterDateToLabel: "Bitiş",
    filterStateLabel: "Durum",
    filterAll: "Tümü",
    filterAssetNetworkFirst: "Önce ağ seçin",
    directionIncoming: "Gelen",
    directionOutgoing: "Giden",
    // Tablo başlıkları.
    columnDate: "Tarih",
    columnDirection: "Yön",
    columnAsset: "Varlık",
    columnAmount: "Miktar",
    columnValue: "USDT Karşılığı",
    columnTx: "İşlem",
    columnSource: "Kaynak",
    // Kaynak badge'leri (Faz 3'te her zaman "Zincir Hareketi").
    sourceChain: "Zincir Hareketi",
    sourceSystem: "Sistem Transferi",
    // Boş durum — iki farklı mesaj, karıştırılmaz (docs/06 §6).
    dateRangeError: "Bitiş tarihi, başlangıç tarihinden önce olamaz.",
    emptyNoFilter: "Henüz bir hareket yok.",
    emptyFiltered: "Bu filtrelerle eşleşen hareket bulunamadı.",
    clearFilters: "Filtreleri Temizle",
    loadError: "Hareket geçmişi yüklenemedi.",
    // Sayfalama.
    prevPage: "Önceki",
    nextPage: "Sonraki",
    /** Sayfa göstergesi — bileşende `${pageWord} ${page} / ${total}` olarak birleştirilir. */
    pageWord: "Sayfa",
    explorerLinkAria: "Blok gezgininde aç",
  },
  testnetDisclaimer: "testnet varlıkları — gösterge değerdir",
  admin: {
    // Admin nav'da bu iterasyonda tek link vardır; Mock Mint (Faz 4 §4.4),
    // Audit Log (Faz 6 §6.3), Kullanıcılar (Faz 6 §6.4) kendi fazlarında eklenir.
    navNetworkAssets: "Ağ / Varlık Yönetimi",
    networkAssets: {
      // TR metinler docs/06_SCREEN_CATALOG.md §4.4'ten birebir.
      title: "Ağ / Varlık Yönetimi",
      statusActive: "Aktif",
      statusPassive: "Pasif",
      readonlyNote: "Mevcut cüzdanlar salt-okunur kalacak.",
      toggleError: "Durum güncellenemedi, lütfen tekrar deneyin.",
      loadError: "Ağ ve varlık listesi yüklenemedi.",
    },
  },
  errorByCode: {
    AUTH_INVALID_CREDENTIALS: "E-posta veya şifre hatalı.",
    EMAIL_ALREADY_EXISTS: "Bu e-posta adresi zaten kayıtlı.",
    RATE_LIMIT_EXCEEDED:
      "Çok fazla deneme yapıldı, lütfen birkaç dakika sonra tekrar deneyin.",
    VALIDATION_FAILED: "Girdiğiniz bilgileri kontrol edin.",
    // S-WALLET-ADD-WATCHONLY hata eşlemesi (docs/06 §4.2).
    WALLET_ADDRESS_INVALID_FORMAT: "Adres formatı bu ağ için geçerli değil.",
    NETWORK_ASSET_INACTIVE: "Bu ağ şu anda kullanıma kapalı.",
    WALLET_ADDRESS_ALREADY_EXISTS: "Bu adres zaten sisteme kayıtlı.",
  } as Record<string, string>,
} as const;
