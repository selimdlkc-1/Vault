import type { TransferStateValue } from "@vault/types";

/**
 * `TransferStateBadge` ortak bileşeni (`docs/06_SCREEN_CATALOG.md` §6 Ortak
 * Bileşenler). 8 transfer durumunun **tek merkezi** TR etiket + renk eşlemesini
 * taşır — S-TRANSFER-DETAIL burada, S-MOVEMENTS Faz 6'da bu bileşeni kullanır;
 * hiçbir ekran kendi badge metnini yeniden yazmaz.
 *
 * a11y (`.claude/rules/24`): durum yalnızca renkle değil her zaman metin
 * etiketiyle de belirtilir; `<span>` semantik olarak yeterli, ek ARIA gerekmez.
 *
 * `confirming` durumu tek istisnadır: eşik bilgisi verilirse etiket
 * "Onaylanıyor (k/N blok)" olur (`docs/06` S-TRANSFER-DETAIL). `confirmedBlocks`
 * (k) canlı zincir yüksekliği gerektirdiğinden `GET /transfers/:id` yanıtında
 * yoktur (endpoint canlı RPC yapmaz — `docs/mimari-kararlar.md` I-003); yalnızca
 * `threshold` (N) verilirse "Onaylanıyor (N blok onayı bekleniyor)" gösterilir.
 */

const LABELS: Record<TransferStateValue, string> = {
  draft: "Taslak",
  pending_signature: "Onay Bekliyor",
  signed: "İmzalandı",
  broadcast: "Ağa Gönderildi",
  confirming: "Onaylanıyor",
  confirmed: "Tamamlandı",
  failed: "Başarısız",
  dropped: "Düştü",
};

const TONE: Record<TransferStateValue, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_signature: "bg-primary/10 text-primary",
  signed: "bg-primary/10 text-primary",
  broadcast: "bg-primary/10 text-primary",
  confirming: "bg-primary/10 text-primary",
  confirmed: "bg-success/10 text-success",
  failed: "bg-danger/10 text-danger",
  dropped: "border border-border bg-muted text-muted-foreground",
};

interface TransferStateBadgeProps {
  state: TransferStateValue;
  /** Yalnızca `confirming`: geçilen onay bloğu sayısı (k). Genelde bilinmez. */
  confirmedBlocks?: number;
  /** Yalnızca `confirming`: ağın gerektirdiği onay eşiği (N). */
  threshold?: number;
}

export function transferStateLabel(
  state: TransferStateValue,
  confirmedBlocks?: number,
  threshold?: number,
): string {
  if (state === "confirming" && threshold !== undefined) {
    return confirmedBlocks !== undefined
      ? `Onaylanıyor (${confirmedBlocks}/${threshold} blok)`
      : `Onaylanıyor (${threshold} blok onayı bekleniyor)`;
  }
  return LABELS[state];
}

export function TransferStateBadge({
  state,
  confirmedBlocks,
  threshold,
}: TransferStateBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[state]}`}
    >
      {transferStateLabel(state, confirmedBlocks, threshold)}
    </span>
  );
}
