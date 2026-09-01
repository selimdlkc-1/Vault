"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { createTransferSchema } from "@vault/types";
import { UsdtValue } from "@/components/composite/usdt-value";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useCreateTransfer } from "@/hooks/use-create-transfer";
import { useNetworkAssets, type NetworkAsset } from "@/hooks/use-network-assets";
import { useNetworks } from "@/hooks/use-networks";
import { useWallets, type WalletListItem } from "@/hooks/use-wallets";
import { ApiError } from "@/lib/api-client";
import { messages } from "@/lib/messages";
import { formatTokenAmount } from "@/lib/token-amount";
import { sumUsdtValues } from "@/lib/usdt";

const t = messages.transferNew;

type FieldKey = "walletId" | "assetId" | "toAddress" | "amount";
type FieldErrors = Partial<Record<FieldKey, string>>;

type AmountParse =
  | { ok: true; value: string }
  | { ok: false; reason: "invalid" | "decimals" };

/**
 * İnsan-okur ondalık tutarı (ör. `"10.5"`) varlığın en küçük birimine çevirir.
 * Hesaplama tamamen `BigInt` üzerinden — hassasiyet kaybı yok (sayısal tip
 * disiplini, `.claude/rules/13`). `createTransferSchema.amount` yalnızca rakam
 * string'i beklediği için form bu dönüşümü göndermeden önce yapar.
 */
function amountToBaseUnit(input: string, decimals: number): AmountParse {
  const raw = input.trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) return { ok: false, reason: "invalid" };

  const [intPart, fracPart = ""] = raw.split(".");
  if (fracPart.length > decimals) return { ok: false, reason: "decimals" };

  const base = 10n ** BigInt(decimals);
  const value =
    BigInt(intPart) * base + BigInt(fracPart.padEnd(decimals, "0") || "0");
  if (value <= 0n) return { ok: false, reason: "invalid" };

  return { ok: true, value: value.toString() };
}

function walletOptionLabel(wallet: WalletListItem, networkLabel: string): string {
  const short =
    wallet.address.length <= 12
      ? wallet.address
      : `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
  return `${networkLabel} · ${short}`;
}

/**
 * S-TRANSFER-NEW (docs/06_SCREEN_CATALOG.md S-TRANSFER-NEW, Faz 5 §5.6a). Kullanıcı
 * S-WALLET-DETAIL'deki "Transfer Gönder" butonuyla (`?walletId=`) veya doğrudan
 * `/transfers/new` ile gelir; gönderen managed cüzdan / varlık / hedef adres /
 * tutar girip bir `draft` transfer oluşturur, başarıda `/transfers/[id]`'e
 * (İterasyon 7'nin onay adımı) yönlenir.
 *
 * `useSearchParams` Next 15'te Suspense sınırı ister (build) — içerik `<Suspense>`
 * ile sarılır (S-WALLET-ADD ile aynı kalıp).
 */
export default function TransferNewPage() {
  return (
    <Suspense
      fallback={
        <div
          className="mx-auto h-80 max-w-md rounded-xl bg-muted"
          aria-hidden
        />
      }
    >
      <TransferNewContent />
    </Suspense>
  );
}

function TransferNewContent() {
  const searchParams = useSearchParams();
  const walletIdParam = searchParams.get("walletId");
  // S-TRANSFER-DETAIL "Yeniden Dene" (dropped) aynı parametrelerle önceden
  // doldurulmuş yeni bir taslak açar (`docs/06` S-TRANSFER-DETAIL, Faz 5 §5.6b).
  // `amount` düz ondalık string olarak gelir (detay ekranı varlığın decimals'ıyla
  // çevirir), form doğrudan kullanır.
  const prefill = {
    assetId: searchParams.get("assetId"),
    toAddress: searchParams.get("toAddress"),
    amount: searchParams.get("amount"),
  };
  const wallets = useWallets({ type: "managed" });

  if (wallets.isPending) {
    return (
      <div className="mx-auto h-80 max-w-md rounded-xl bg-muted" aria-hidden />
    );
  }

  if (wallets.isError) {
    return (
      <section className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-md bg-danger/10 px-3 py-2">
        <p role="alert" className="text-sm text-danger">
          {t.loadError}
        </p>
        <Button variant="secondary" onClick={() => void wallets.refetch()}>
          {messages.common.retry}
        </Button>
      </section>
    );
  }

  // Boş state: hiç managed cüzdan yoksa form yerine uyarı + S-WALLET-ADD-MANAGED.
  if (wallets.data.length === 0) {
    return (
      <section className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-border px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-zinc-900">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.empty}</p>
        <Link
          href="/wallets/add?type=managed"
          className={buttonClasses("primary")}
        >
          {t.emptyCta}
        </Link>
      </section>
    );
  }

  return (
    <TransferForm
      wallets={wallets.data}
      initialWalletId={walletIdParam}
      initialAssetId={prefill.assetId}
      initialToAddress={prefill.toAddress}
      initialAmount={prefill.amount}
    />
  );
}

function TransferForm({
  wallets,
  initialWalletId,
  initialAssetId,
  initialToAddress,
  initialAmount,
}: {
  wallets: WalletListItem[];
  initialWalletId: string | null;
  initialAssetId: string | null;
  initialToAddress: string | null;
  initialAmount: string | null;
}) {
  const router = useRouter();
  const networks = useNetworks();
  const createTransfer = useCreateTransfer();

  const initialWallet = wallets.some((w) => w.id === initialWalletId)
    ? (initialWalletId as string)
    : "";

  const [walletId, setWalletId] = useState(initialWallet);
  // `assetId` ön-doldurması yalnızca bir cüzdan seçiliyken anlamlı — `AssetField`
  // mount olunca seçili değeri seçenek listesiyle doğrular.
  const [assetId, setAssetId] = useState(initialWallet ? (initialAssetId ?? "") : "");
  const [toAddress, setToAddress] = useState(initialToAddress ?? "");
  const [amountInput, setAmountInput] = useState(initialAmount ?? "");
  const [assetOptions, setAssetOptions] = useState<NetworkAsset[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);

  const selectedWallet = wallets.find((w) => w.id === walletId) ?? null;
  const selectedAsset = assetOptions.find((a) => a.id === assetId) ?? null;

  const networkName = (id: string) =>
    networks.data?.find((n) => n.id === id)?.name ?? id;

  const changeWallet = (id: string) => {
    setWalletId(id);
    setAssetId("");
    setAssetOptions([]);
    setErrors({});
    setBanner(null);
  };

  const selectedBalanceRaw =
    selectedWallet?.balances.find((b) => b.assetId === assetId)?.balanceRaw ??
    "0";

  const applyApiError = (error: unknown) => {
    if (!(error instanceof ApiError)) {
      setBanner(messages.common.genericError);
      return;
    }
    switch (error.code) {
      case "WALLET_CROSS_NETWORK_MISMATCH":
        setErrors({ toAddress: t.errorCrossNetwork });
        return;
      case "NETWORK_ASSET_INACTIVE":
        setErrors({ assetId: t.errorAssetInactive });
        return;
      case "VALIDATION_FAILED":
        setErrors({ amount: t.errorAmountInvalid });
        return;
      default:
        setBanner(messages.errorByCode[error.code] ?? error.message);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBanner(null);

    const next: FieldErrors = {};
    if (!walletId) next.walletId = t.errorWalletRequired;
    if (!assetId) next.assetId = t.errorAssetRequired;
    const trimmedAddress = toAddress.trim();
    if (!trimmedAddress) next.toAddress = t.errorAddressRequired;

    let amountBase: string | null = null;
    if (selectedAsset) {
      const parsed = amountToBaseUnit(amountInput, selectedAsset.decimals);
      if (parsed.ok) {
        amountBase = parsed.value;
      } else {
        next.amount =
          parsed.reason === "decimals"
            ? t.errorAmountDecimals.replace(
                "{decimals}",
                String(selectedAsset.decimals),
              )
            : t.errorAmountInvalid;
      }
    } else if (!next.assetId) {
      next.assetId = t.errorAssetRequired;
    }

    if (Object.keys(next).length > 0 || amountBase === null) {
      setErrors(next);
      return;
    }

    // Şemanın frontend formunda birebir kullanımı (`packages/types` — son kapı).
    const parsed = createTransferSchema.safeParse({
      walletId,
      toAddress: trimmedAddress,
      assetId,
      amount: amountBase,
    });
    if (!parsed.success) {
      const mapped: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (
          key === "walletId" ||
          key === "assetId" ||
          key === "toAddress" ||
          key === "amount"
        ) {
          mapped[key] = t.errorFieldInvalid;
        }
      }
      setErrors(mapped);
      return;
    }

    setErrors({});
    try {
      const created = await createTransfer.mutateAsync(parsed.data);
      router.push(`/transfers/${created.id}`);
    } catch (error) {
      applyApiError(error);
    }
  };

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-900">{t.title}</h1>

      <form className="flex flex-col gap-5" noValidate onSubmit={onSubmit}>
        {banner ? (
          <p
            role="alert"
            className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {banner}
          </p>
        ) : null}

        {/* 1 — Gönderen Cüzdan */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="walletId"
            className="text-sm font-medium text-zinc-900"
          >
            {t.walletLabel}
          </label>
          <select
            id="walletId"
            value={walletId}
            aria-invalid={errors.walletId ? true : undefined}
            aria-describedby={errors.walletId ? "walletId-error" : undefined}
            onChange={(event) => changeWallet(event.target.value)}
            className="h-10 rounded-md border border-border bg-white px-3 text-sm text-zinc-900 outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary aria-[invalid=true]:border-danger"
          >
            <option value="">{t.walletPlaceholder}</option>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {walletOptionLabel(wallet, networkName(wallet.networkId))}
              </option>
            ))}
          </select>
          {errors.walletId ? (
            <p id="walletId-error" role="alert" className="text-xs text-danger">
              {errors.walletId}
            </p>
          ) : null}
        </div>

        {/* 2 — Varlık: yalnızca bir cüzdan seçiliyken mount edilir */}
        {selectedWallet ? (
          <AssetField
            networkId={selectedWallet.networkId}
            value={assetId}
            error={errors.assetId}
            onChange={setAssetId}
            onOptionsChange={setAssetOptions}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-900">
              {t.assetLabel}
            </span>
            <select
              disabled
              aria-label={t.assetLabel}
              className="h-10 rounded-md border border-border bg-white px-3 text-sm text-muted-foreground opacity-50"
            >
              <option>{t.assetNetworkFirst}</option>
            </select>
          </div>
        )}

        {/* 3 — Hedef Adres */}
        <Field
          id="toAddress"
          label={t.toAddressLabel}
          autoComplete="off"
          spellCheck={false}
          value={toAddress}
          onChange={(event) => setToAddress(event.target.value)}
          error={errors.toAddress}
        />

        {/* 4 — Tutar */}
        <Field
          id="amount"
          label={t.amountLabel}
          inputMode="decimal"
          autoComplete="off"
          placeholder={t.amountPlaceholder}
          disabled={!selectedAsset}
          value={amountInput}
          onChange={(event) => setAmountInput(event.target.value)}
          error={errors.amount}
          hint={
            selectedAsset ? (
              <span>
                {t.availableBalance
                  .replace(
                    "{amount}",
                    formatTokenAmount(
                      selectedBalanceRaw,
                      selectedAsset.decimals,
                    ),
                  )
                  .replace("{symbol}", selectedAsset.symbol)}
              </span>
            ) : undefined
          }
        />

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={createTransfer.isPending}>
            {createTransfer.isPending ? t.submitting : t.submit}
          </Button>
          <Link href="/wallets" className={buttonClasses("secondary")}>
            {t.cancel}
          </Link>
        </div>
      </form>

      <PortfolioNote wallet={selectedWallet} />
    </section>
  );
}

/**
 * Seçili cüzdanın toplam değerini küçük bir bilgi satırı olarak gösterir —
 * parasal değer tek kaynak `UsdtValue`'dan geçer (`.claude/rules/24`).
 */
function PortfolioNote({ wallet }: { wallet: WalletListItem | null }) {
  if (!wallet) return null;
  const total = sumUsdtValues(wallet.balances.map((b) => b.valueUsdt));
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      {messages.wallets.columnValue}: <UsdtValue value={total} />
    </p>
  );
}

function AssetField({
  networkId,
  value,
  error,
  onChange,
  onOptionsChange,
}: {
  networkId: string;
  value: string;
  error?: string;
  onChange: (assetId: string) => void;
  onOptionsChange: (assets: NetworkAsset[]) => void;
}) {
  const assets = useNetworkAssets(networkId);

  // "seçili cüzdanın ağındaki aktif varlıklar" (docs/06 S-TRANSFER-NEW alan listesi).
  const active = useMemo(
    () => (assets.data ?? []).filter((a) => a.isActive),
    [assets.data],
  );

  useEffect(() => {
    onOptionsChange(active);
  }, [active, onOptionsChange]);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="assetId" className="text-sm font-medium text-zinc-900">
        {t.assetLabel}
      </label>
      <select
        id="assetId"
        value={value}
        disabled={assets.isPending || active.length === 0}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "assetId-error" : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-md border border-border bg-white px-3 text-sm text-zinc-900 outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">{t.assetPlaceholder}</option>
        {active.map((asset) => (
          <option key={asset.id} value={asset.id}>
            {asset.symbol}
          </option>
        ))}
      </select>
      {assets.isPending ? (
        <p className="text-xs text-muted-foreground">{t.assetLoading}</p>
      ) : null}
      {assets.isError ? (
        <p role="alert" className="text-xs text-danger">
          {t.assetError}
        </p>
      ) : null}
      {!assets.isPending && !assets.isError && active.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t.assetEmpty}</p>
      ) : null}
      {error ? (
        <p id="assetId-error" role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
