"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AddressDisplay } from "@/components/composite/address-display";
import { ExplorerLink } from "@/components/composite/explorer-link";
import {
  TransferStateBadge,
  transferStateLabel,
} from "@/components/composite/transfer-state-badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useConfirmTransfer } from "@/hooks/use-confirm-transfer";
import { useDeleteTransfer } from "@/hooks/use-delete-transfer";
import { useNetworkAssets } from "@/hooks/use-network-assets";
import { useNetworks } from "@/hooks/use-networks";
import { useTransfer, type TransferDetail } from "@/hooks/use-transfer";
import { useWallet } from "@/hooks/use-wallet";
import { useToast } from "@/context/toast-context";
import { ApiError } from "@/lib/api-client";
import { messages } from "@/lib/messages";
import { transferKeys } from "@/lib/query-keys";
import { baseUnitToPlainDecimal, formatTokenAmount } from "@/lib/token-amount";

const tc = messages.transferConfirm;
const td = messages.transferDetail;

const dateTime = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * S-TRANSFER-CONFIRM + S-TRANSFER-DETAIL — tek `/transfers/[id]` route'u
 * (`docs/06_SCREEN_CATALOG.md`, Faz 5 §5.6b). `state === 'draft'` iken step-up
 * onay formu (S-TRANSFER-CONFIRM), diğer her durumda 5 sn polling'li izleme
 * görünümü (S-TRANSFER-DETAIL) render edilir. İkisi de aynı `useTransfer(id)`
 * sorgusuna bağlıdır; onaydan hemen sonra kesintisiz geçiş için tek dosyada
 * birleştirilir (backend de bu route'u birleşik ele alır).
 */
export default function TransferPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const transfer = useTransfer(id);

  const forbidden =
    transfer.error instanceof ApiError &&
    transfer.error.code === "FORBIDDEN_NOT_OWNER";
  const notFound =
    transfer.error instanceof ApiError &&
    transfer.error.code === "RESOURCE_NOT_FOUND";

  // S-FORBIDDEN-403 Faz 7 §7.4'e kadar yok — geçici olarak `/dashboard`'a
  // yönlendirilir (S-WALLET-DETAIL kalıbı). Asıl yetki kontrolü backend'de.
  useEffect(() => {
    if (forbidden) router.replace("/dashboard");
  }, [forbidden, router]);

  if (transfer.isPending || forbidden) {
    return <DetailSkeleton />;
  }

  if (notFound) {
    return (
      <section className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-border px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">{td.loadError}</p>
        <Link href="/movements" className={buttonClasses("primary")}>
          {td.backToMovements}
        </Link>
      </section>
    );
  }

  if (transfer.isError) {
    return (
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 rounded-md bg-danger/10 px-3 py-2">
        <p role="alert" className="text-sm text-danger">
          {td.loadError}
        </p>
        <Button variant="secondary" onClick={() => void transfer.refetch()}>
          {td.retry}
        </Button>
      </div>
    );
  }

  return transfer.data.state === "draft" ? (
    <ConfirmView transfer={transfer.data} />
  ) : (
    <DetailView transfer={transfer.data} />
  );
}

/* ------------------------------------------------------------------ */
/* Ortak: transfer bağlam bilgisi (ağ, varlık)                         */
/* ------------------------------------------------------------------ */

function useTransferContext(transfer: TransferDetail) {
  const networks = useNetworks();
  const assets = useNetworkAssets(transfer.networkId);

  const network = networks.data?.find((n) => n.id === transfer.networkId) ?? null;
  const asset = assets.data?.find((a) => a.id === transfer.assetId) ?? null;

  const amountLabel = asset
    ? `${formatTokenAmount(transfer.amount, asset.decimals)} ${asset.symbol}`
    : transfer.amount;

  return { network, asset, amountLabel };
}

/* ------------------------------------------------------------------ */
/* S-TRANSFER-CONFIRM                                                  */
/* ------------------------------------------------------------------ */

function ConfirmView({ transfer }: { transfer: TransferDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { network, amountLabel } = useTransferContext(transfer);
  const wallet = useWallet(transfer.walletId);

  const confirmTransfer = useConfirmTransfer(transfer.id);
  const deleteTransfer = useDeleteTransfer(transfer.id);

  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const busy = confirmTransfer.isPending || deleteTransfer.isPending;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBanner(null);
    setPasswordError(null);

    if (password.trim() === "") {
      setPasswordError(tc.passwordRequired);
      return;
    }

    try {
      await confirmTransfer.mutateAsync({ currentPassword: password });
      // Başarı: `useTransfer` invalidate edildi → yeni state (`pending_signature`)
      // ile refetch → bu bileşen unmount, S-TRANSFER-DETAIL mount olur.
      showToast(tc.successToast);
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setBanner(messages.common.genericError);
        return;
      }
      switch (error.code) {
        case "AUTH_STEP_UP_REQUIRED":
          // Yalnızca şifre alanı sıfırlanır; özet bilgiler korunur (`docs/06`).
          setPassword("");
          setPasswordError(tc.errorStepUp);
          return;
        case "WALLET_INSUFFICIENT_BALANCE":
          setBanner(tc.errorInsufficientBalance);
          return;
        case "TRANSFER_INVALID_TRANSITION":
          // Durum başka yerden değişmiş — `useTransfer`'ı invalidate et,
          // refetch S-TRANSFER-DETAIL görünümüne düşürür.
          setBanner(tc.errorInvalidTransition);
          void queryClient.invalidateQueries({
            queryKey: transferKeys.detail(transfer.id),
          });
          return;
        default:
          setBanner(messages.errorByCode[error.code] ?? error.message);
      }
    }
  };

  const onCancel = async () => {
    setBanner(null);
    try {
      await deleteTransfer.mutateAsync();
      router.push("/wallets");
    } catch (error) {
      if (error instanceof ApiError && error.code === "TRANSFER_INVALID_TRANSITION") {
        // Artık `draft` değil — silinemez; izleme görünümüne düşülür.
        setBanner(tc.errorInvalidTransition);
        void queryClient.invalidateQueries({
          queryKey: transferKeys.detail(transfer.id),
        });
        return;
      }
      setBanner(messages.common.genericError);
    }
  };

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-900">{tc.title}</h1>

      <dl className="flex flex-col gap-3 rounded-xl border border-border px-4 py-4 text-sm">
        <p className="text-sm font-semibold text-zinc-900">{tc.summaryTitle}</p>
        <SummaryRow label={tc.walletLabel}>
          {wallet.data ? (
            <AddressDisplay address={wallet.data.address} />
          ) : (
            <span className="text-muted-foreground">
              {network?.name ?? transfer.networkId}
            </span>
          )}
        </SummaryRow>
        <SummaryRow label={tc.toAddressLabel}>
          <AddressDisplay address={transfer.toAddress} />
        </SummaryRow>
        <SummaryRow label={tc.amountLabel}>
          <span className="tabular-nums text-zinc-900">{amountLabel}</span>
        </SummaryRow>
      </dl>

      <form className="flex flex-col gap-5" noValidate onSubmit={onSubmit}>
        {banner ? (
          <p
            role="alert"
            className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {banner}
          </p>
        ) : null}

        <Field
          id="currentPassword"
          type="password"
          label={tc.passwordLabel}
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={passwordError ?? undefined}
        />

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy}>
            {confirmTransfer.isPending ? tc.submitting : tc.submit}
          </Button>
          <Button variant="secondary" onClick={() => void onCancel()} disabled={busy}>
            {deleteTransfer.isPending ? tc.cancelling : tc.cancel}
          </Button>
        </div>
      </form>
    </section>
  );
}

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* S-TRANSFER-DETAIL                                                   */
/* ------------------------------------------------------------------ */

function DetailView({ transfer }: { transfer: TransferDetail }) {
  const { network, asset, amountLabel } = useTransferContext(transfer);

  const isConfirming = transfer.state === "confirming";
  const isFailure = transfer.state === "failed" || transfer.state === "dropped";

  const retryHref =
    transfer.state === "dropped"
      ? retryTransferHref(transfer, asset?.decimals)
      : null;

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900">{td.title}</h1>
        <TransferStateBadge
          state={transfer.state}
          threshold={isConfirming ? network?.confirmationThreshold : undefined}
        />
      </header>

      {isConfirming ? (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={transferStateLabel(
            "confirming",
            undefined,
            network?.confirmationThreshold,
          )}
        >
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
        </div>
      ) : null}

      <dl className="flex flex-col gap-3 rounded-xl border border-border px-4 py-4 text-sm">
        <SummaryRow label={td.statusLabel}>
          <span className="text-zinc-900">
            {transferStateLabel(
              transfer.state,
              undefined,
              isConfirming ? network?.confirmationThreshold : undefined,
            )}
          </span>
        </SummaryRow>
        <SummaryRow label={td.toAddressLabel}>
          <AddressDisplay address={transfer.toAddress} />
        </SummaryRow>
        <SummaryRow label={td.amountLabel}>
          <span className="tabular-nums text-zinc-900">{amountLabel}</span>
        </SummaryRow>
        {transfer.txHash ? (
          <SummaryRow label={td.txHashLabel}>
            {network ? (
              <ExplorerLink chainId={network.chainId} txHash={transfer.txHash} />
            ) : (
              <span className="font-mono text-xs text-muted-foreground">
                {transfer.txHash}
              </span>
            )}
          </SummaryRow>
        ) : null}
        {isFailure && transfer.failureReason ? (
          <SummaryRow label={td.failureReasonLabel}>
            <span className="text-danger">{transfer.failureReason}</span>
          </SummaryRow>
        ) : null}
      </dl>

      <Timeline
        events={transfer.stateEvents}
        threshold={network?.confirmationThreshold}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/movements" className={buttonClasses("secondary")}>
          {td.backToMovements}
        </Link>
        {retryHref ? (
          <Link href={retryHref} className={buttonClasses("primary")}>
            {td.retry}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/**
 * "Yeniden Dene" (yalnızca `dropped`) — S-TRANSFER-NEW'e aynı parametrelerle
 * önceden doldurulmuş gider, yeni bir `draft` oluşturur (eski kayıt değişmez,
 * `docs/06` S-TRANSFER-DETAIL). `amount` düz ondalık string'e çevrilir (form
 * doğrudan input değeri olarak kullanır); varlık decimals'ı henüz yüklenmemişse
 * tutar atlanır, kullanıcı elle girer.
 */
function retryTransferHref(
  transfer: TransferDetail,
  assetDecimals: number | undefined,
): string {
  const params = new URLSearchParams({
    walletId: transfer.walletId,
    assetId: transfer.assetId,
    toAddress: transfer.toAddress,
  });
  if (assetDecimals !== undefined) {
    params.set("amount", baseUnitToPlainDecimal(transfer.amount, assetDecimals));
  }
  return `/transfers/new?${params.toString()}`;
}

function Timeline({
  events,
  threshold,
}: {
  events: TransferDetail["stateEvents"];
  threshold?: number;
}) {
  if (events.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-zinc-900">{td.timelineTitle}</h2>
      <ol className="flex flex-col gap-2 border-l border-border pl-4">
        {events.map((event, index) => (
          <li key={`${event.toState}-${event.occurredAt}-${index}`} className="text-sm">
            <span className="text-zinc-900">
              {transferStateLabel(
                event.toState,
                undefined,
                event.toState === "confirming" ? threshold : undefined,
              )}
            </span>
            <span className="text-muted-foreground">
              {" · "}
              {actorLabel(event.actor)}
              {" · "}
              {dateTime.format(new Date(event.occurredAt))}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function actorLabel(actor: string): string {
  switch (actor) {
    case "user":
      return td.actorUser;
    case "system":
      return td.actorSystem;
    case "worker:signing":
      return td.actorWorkerSigning;
    case "worker:broadcast":
      return td.actorWorkerBroadcast;
    case "worker:confirmation":
      return td.actorWorkerConfirmation;
    default:
      return actor;
  }
}

function DetailSkeleton() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8" aria-hidden>
      <div className="h-8 w-48 rounded-md bg-muted" />
      <div className="h-40 rounded-xl border border-border bg-muted" />
      <div className="h-24 rounded-lg bg-muted" />
    </div>
  );
}
