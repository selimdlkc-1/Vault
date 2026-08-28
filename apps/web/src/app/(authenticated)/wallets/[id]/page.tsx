"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { WalletTypeValue } from "@vault/types";
import { AddressDisplay } from "@/components/composite/address-display";
import { UsdtValue } from "@/components/composite/usdt-value";
import { Button, buttonClasses } from "@/components/ui/button";
import { useNetworkAssets } from "@/hooks/use-network-assets";
import { useNetworks } from "@/hooks/use-networks";
import { useWallet } from "@/hooks/use-wallet";
import { ApiError } from "@/lib/api-client";
import { messages } from "@/lib/messages";
import { formatTokenAmount } from "@/lib/token-amount";
import { sumUsdtValues } from "@/lib/usdt";

const t = messages.walletDetail;

const TYPE_LABEL: Record<WalletTypeValue, string> = {
  watch_only: messages.wallets.typeWatchOnly,
  managed: messages.wallets.typeManaged,
};

/**
 * S-WALLET-DETAIL (docs/06_SCREEN_CATALOG.md §4.2). Bir cüzdanın adresi, ağı, tipi,
 * varlık bazlı bakiyeleri ve son 5 zincir hareketi. Salt-okunur — kullanıcı girdisi
 * yoktur.
 *
 * Yetkisiz durum: backend `FORBIDDEN_NOT_OWNER` döndürürse S-FORBIDDEN-403'e
 * yönlendirilmeli (docs/06); o ekran Faz 7 §7.4'e kadar yok, bu yüzden geçici
 * olarak `/dashboard`'a yönlendirilir (Faz 1/2 placeholder disiplini). Asıl yetki
 * kontrolü zaten backend'de (`.claude/rules/03`).
 *
 * "Transfer Gönder" butonu yalnızca `type === 'managed'` cüzdanlarda görünür;
 * Faz 3'te hiç managed cüzdan olmadığından pratikte görünmez, koşul Faz 4 sonrası
 * devreye girer (spec'e göre baştan doğru yazılır).
 */
export default function WalletDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const wallet = useWallet(params.id);
  const networks = useNetworks();

  const forbidden =
    wallet.error instanceof ApiError && wallet.error.code === "FORBIDDEN_NOT_OWNER";
  const notFound =
    wallet.error instanceof ApiError && wallet.error.code === "RESOURCE_NOT_FOUND";

  useEffect(() => {
    if (forbidden) {
      router.replace("/dashboard");
    }
  }, [forbidden, router]);

  if (wallet.isPending || forbidden) {
    return <DetailSkeleton />;
  }

  if (notFound) {
    return (
      <section className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-border px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">{t.notFound}</p>
        <Link href="/wallets" className={buttonClasses("primary")}>
          {t.backToList}
        </Link>
      </section>
    );
  }

  if (wallet.isError) {
    return (
      <ErrorBanner message={t.loadError} onRetry={() => void wallet.refetch()} />
    );
  }

  const data = wallet.data;
  const networkName =
    networks.data?.find((n) => n.id === data.networkId)?.name ?? data.networkId;
  const total = sumUsdtValues(data.balances.map((b) => b.valueUsdt));

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold text-zinc-900">{t.title}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>{networkName}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {TYPE_LABEL[data.type]}
            </span>
            <AddressDisplay address={data.address} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <UsdtValue value={total} />
          {data.type === "managed" ? (
            <Link
              href={`/transfers/new?walletId=${data.id}`}
              className={buttonClasses("primary")}
            >
              {t.sendTransfer}
            </Link>
          ) : null}
        </div>
      </header>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">{t.balancesTitle}</h2>
        {data.balances.length === 0 ? (
          <p className="rounded-lg border border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {t.balancesEmpty}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[24rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">{t.columnAsset}</th>
                  <th className="py-2 font-medium">{t.columnAmount}</th>
                  <th className="py-2 text-right font-medium">{t.columnValue}</th>
                </tr>
              </thead>
              <tbody>
                {data.balances.map((balance) => (
                  <tr key={balance.assetId} className="border-b border-border/60">
                    <td className="py-2 font-medium text-zinc-900">
                      {balance.symbol}
                    </td>
                    <td className="py-2 tabular-nums text-zinc-900">
                      <AssetAmount
                        networkId={data.networkId}
                        assetId={balance.assetId}
                        balanceRaw={balance.balanceRaw}
                      />
                    </td>
                    <td className="py-2 text-right">
                      <UsdtValue value={balance.valueUsdt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">
            {t.movementsTitle}
          </h2>
          <Link
            href={`/movements?walletId=${data.id}`}
            className="text-sm text-primary hover:underline"
          >
            {t.seeAllMovements}
          </Link>
        </div>
        {/* İterasyon 8'e (chain_movements + movement-index worker) kadar backend
            her zaman boş dizi döner; İterasyon 9 bu listeyi doldurur. */}
        <p className="rounded-lg border border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {t.movementsEmpty}
        </p>
      </div>
    </section>
  );
}

/**
 * Bakiyeyi insan-okur miktara çevirir. `decimals` cüzdanın ağının varlık
 * listesinden gelir (`GET /networks/:id/assets`); henüz yüklenmediyse ham değer
 * gösterilir (kısa bir ara durum).
 */
function AssetAmount({
  networkId,
  assetId,
  balanceRaw,
}: {
  networkId: string;
  assetId: string;
  balanceRaw: string;
}) {
  const assets = useNetworkAssets(networkId);
  const decimals = assets.data?.find((a) => a.id === assetId)?.decimals;
  return (
    <>{decimals === undefined ? balanceRaw : formatTokenAmount(balanceRaw, decimals)}</>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-md bg-danger/10 px-3 py-2">
      <p role="alert" className="text-sm text-danger">
        {message}
      </p>
      <Button variant="secondary" onClick={onRetry}>
        {messages.common.retry}
      </Button>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8" aria-hidden>
      <div className="h-16 w-full rounded-md bg-muted" />
      <div className="h-40 rounded-lg border border-border bg-muted" />
      <div className="h-24 rounded-lg border border-border bg-muted" />
    </div>
  );
}
