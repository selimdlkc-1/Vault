/**
 * Token miktarı gösterimi (docs/05_FRONTEND_SPEC.md §7). Backend bakiyeyi her zaman
 * en küçük birimde (wei/sun) bir `BigInt` string'i olarak döner (`balanceRaw`);
 * insan-okur "miktar" gösterimi için varlığın `decimals` değeriyle ölçeklenir.
 *
 * Hesaplama tamamen `BigInt` üzerinden yapılır — `Number`'a hiç dönülmez, bu yüzden
 * hassasiyet kaybı yoktur. Sonuç TR sayı biçimindedir (nokta binlik, virgül ondalık),
 * `UsdtValue` ile aynı konvansiyon. Bu yalnızca token *miktarıdır*, parasal değer
 * değildir — parasal değer tek kaynak olarak `UsdtValue`'dan geçer.
 */
const trInteger = new Intl.NumberFormat("tr-TR");

/**
 * Ham en-küçük-birim tutarını (`"10500000"`) düz ondalık string'e çevirir
 * (`"10.5"`) — TR biçimlendirme (binlik/virgül) **yapmadan**. `formatTokenAmount`
 * gösterim içindir; bu ise sonucu bir form alanına geri koyabilmek içindir
 * (S-TRANSFER-DETAIL "Yeniden Dene" → S-TRANSFER-NEW `?amount=` ön-doldurma).
 * Geçersiz girdi olduğu gibi döner. Hesaplama tamamen `BigInt` üzerinden.
 */
export function baseUnitToPlainDecimal(raw: string, decimals: number): string {
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return raw;
  if (decimals === 0) return value;

  const padded = value.padStart(decimals + 1, "0");
  const cut = padded.length - decimals;
  const intPart = padded.slice(0, cut).replace(/^0+(?=\d)/, "");
  const fracPart = padded.slice(cut).replace(/0+$/, "");
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

export function formatTokenAmount(balanceRaw: string, decimals: number): string {
  let raw = balanceRaw.trim();
  let negative = false;
  if (raw.startsWith("-")) {
    negative = true;
    raw = raw.slice(1);
  }

  let intPart: string;
  let fracPart: string;
  try {
    // Yapısal doğrulama: geçerli bir tamsayı değilse ham değeri döndür.
    BigInt(raw);
    const padded = raw.padStart(decimals + 1, "0");
    const cut = padded.length - decimals;
    intPart = padded.slice(0, cut);
    fracPart = decimals > 0 ? padded.slice(cut).replace(/0+$/, "") : "";
  } catch {
    return balanceRaw;
  }

  const formatted = trInteger.format(BigInt(intPart));
  const withFrac = fracPart ? `${formatted},${fracPart}` : formatted;
  return negative && withFrac !== "0" ? `-${withFrac}` : withFrac;
}
