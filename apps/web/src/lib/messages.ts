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
  // "Hareketler" linki İterasyon 9'a (S-MOVEMENTS) kadar placeholder route'a gider.
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
  movements: {
    // Geçici placeholder (İterasyon 9 — S-MOVEMENTS). Faz 1/2 placeholder disiplini.
    placeholderTitle: "Hareketler",
    placeholderBody:
      "Zincir hareketleri listesi Faz 3 §3.6b'de (İterasyon 9) eklenecek.",
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
  } as Record<string, string>,
} as const;
