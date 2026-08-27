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
    placeholderTitle: "Giriş başarılı",
    placeholderBody:
      "Bu geçici bir yer tutucu ekrandır. Portföy panosu Faz 3 §3.5'te eklenecek.",
    logout: "Çıkış Yap",
  },
  errorByCode: {
    AUTH_INVALID_CREDENTIALS: "E-posta veya şifre hatalı.",
    EMAIL_ALREADY_EXISTS: "Bu e-posta adresi zaten kayıtlı.",
    RATE_LIMIT_EXCEEDED:
      "Çok fazla deneme yapıldı, lütfen birkaç dakika sonra tekrar deneyin.",
    VALIDATION_FAILED: "Girdiğiniz bilgileri kontrol edin.",
  } as Record<string, string>,
} as const;
