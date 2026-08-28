interface UsdtValueProps {
  /**
   * USDT karşılığı — 18-ondalıklı sabit decimal string veya fiyat bilinmiyorsa
   * `null` (`docs/mimari-kararlar.md` P-014/P-015). `null` → "—" render edilir
   * (İterasyon 4/5'in "fiyat eksikse hata değil, null" kararının UI karşılığı).
   */
  value: string | null;
  /** Büyük punto gösterim (S-DASHBOARD toplam değer alanı). */
  emphasis?: boolean;
}

const trFormat = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * `UsdtValue` ortak bileşeni (docs/05_FRONTEND_SPEC.md §7, docs/06 §6,
 * `.claude/rules/24`). Parasal değer gösteren TEK kaynak: her zaman
 * `"1.234,56 USDT"` (TR sayı biçimi — nokta binlik, virgül ondalık), hiçbir
 * koşulda `$` üretmez. Bu bileşenin dışında manuel para birimi string'i
 * formatlanmaz.
 */
export function UsdtValue({ value, emphasis = false }: UsdtValueProps) {
  const numeric = value === null ? null : Number(value);
  const text =
    numeric === null || !Number.isFinite(numeric)
      ? "—"
      : `${trFormat.format(numeric)} USDT`;

  return (
    <span
      className={
        emphasis
          ? "text-3xl font-semibold tabular-nums text-zinc-900"
          : "tabular-nums text-zinc-900"
      }
      aria-label={
        numeric === null || !Number.isFinite(numeric)
          ? "Değer bilinmiyor"
          : text
      }
    >
      {text}
    </span>
  );
}
