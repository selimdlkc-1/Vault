"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AddressDisplay } from "@/components/composite/address-display";
import { ExplorerLink } from "@/components/composite/explorer-link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useToast } from "@/context/toast-context";
import {
  useAdminUserSearch,
  type AdminUserRow,
} from "@/hooks/use-admin-user-search";
import { useAdminUserWallets } from "@/hooks/use-admin-user-wallets";
import { useMint } from "@/hooks/use-mint";
import { useNetworkAssets, type NetworkAsset } from "@/hooks/use-network-assets";
import { useNetworks } from "@/hooks/use-networks";
import type { WalletListItem } from "@/hooks/use-wallets";
import { ApiError } from "@/lib/api-client";
import { messages } from "@/lib/messages";
import { formatTokenAmount } from "@/lib/token-amount";

const t = messages.admin.mint;

/** Bu oturumda yapılan başarılı mint'lerin ekran-içi özeti (docs/06 S-ADMIN-MINT "Başarı"). */
interface RecentMint {
  id: string;
  amountDisplay: string;
  symbol: string;
  walletAddress: string;
  txHash: string;
  chainId: string;
}

const RECENT_LIMIT = 10;

type AmountParse =
  | { ok: true; value: string }
  | { ok: false; reason: "invalid" | "decimals" };

/**
 * İnsan-okur ondalık tutarı (ör. `"10.5"`) varlığın en küçük birimine çevirir.
 * Hesaplama tamamen `BigInt` üzerinden — hassasiyet kaybı yok (`docs/04` §5,
 * sayısal tip disiplini). `mintSchema.amount` yalnızca rakam string'i beklediği
 * için form bu dönüşümü göndermeden önce yapar.
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

/**
 * S-ADMIN-MINT (docs/06_SCREEN_CATALOG.md S-ADMIN-MINT, Faz 4 §4.4c). Admin bir
 * kullanıcıyı e-posta ile arayıp seçer → o kullanıcının cüzdanlarından birini →
 * cüzdanın ağındaki aktif bir mock varlığı → tutar girer → "Mint Et".
 *
 * Alanlar kademeli aktifleşir: Kullanıcı seçilmeden Cüzdan, Cüzdan seçilmeden
 * Varlık, Varlık seçilmeden Tutar devre dışıdır. Başarıda toast + form sıfırlanır
 * + "Son Mint İşlemleri" listesi (yalnızca bu oturum, ayrı bir endpoint yok)
 * güncellenir. Faz 4 İnsan onay noktasının "mint uçtan uca çalışıyor" tarafı.
 */
export default function AdminMintPage() {
  const { showToast } = useToast();
  const networks = useNetworks();
  const mint = useMint();

  const [userQuery, setUserQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [walletId, setWalletId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [assetOptions, setAssetOptions] = useState<NetworkAsset[]>([]);
  const [amountInput, setAmountInput] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentMint[]>([]);

  const wallets = useAdminUserWallets(selectedUser?.id ?? null);
  const selectedWallet = wallets.data?.find((w) => w.id === walletId) ?? null;
  const selectedAsset = assetOptions.find((a) => a.id === assetId) ?? null;

  const networkName = (networkId: string) =>
    networks.data?.find((n) => n.id === networkId)?.name ?? networkId;
  const chainIdOf = (networkId: string) =>
    networks.data?.find((n) => n.id === networkId)?.chainId ?? "";

  const resetForm = () => {
    setUserQuery("");
    setSelectedUser(null);
    setWalletId("");
    setAssetId("");
    setAssetOptions([]);
    setAmountInput("");
    setAmountError(null);
  };

  const pickUser = (user: AdminUserRow) => {
    setSelectedUser(user);
    setUserQuery("");
    setWalletId("");
    setAssetId("");
    setAssetOptions([]);
    setAmountInput("");
    setAmountError(null);
    setBanner(null);
  };

  const changeWallet = (id: string) => {
    setWalletId(id);
    setAssetId("");
    setAssetOptions([]);
    setAmountInput("");
    setAmountError(null);
  };

  const changeAsset = (id: string) => {
    setAssetId(id);
    setAmountInput("");
    setAmountError(null);
  };

  const canSubmit =
    !!selectedAsset && amountInput.trim().length > 0 && !mint.isPending;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedAsset || !selectedWallet) return;
    setBanner(null);
    setAmountError(null);

    const parsed = amountToBaseUnit(amountInput, selectedAsset.decimals);
    if (!parsed.ok) {
      setAmountError(
        parsed.reason === "decimals"
          ? t.amountTooManyDecimals.replace(
              "{decimals}",
              String(selectedAsset.decimals),
            )
          : t.amountInvalid,
      );
      return;
    }

    try {
      const result = await mint.mutateAsync({
        walletId,
        assetId,
        amount: parsed.value,
      });
      const amountDisplay = formatTokenAmount(
        parsed.value,
        selectedAsset.decimals,
      );
      showToast(`${amountDisplay} ${selectedAsset.symbol} ${t.mintedSuffix}`);
      setRecent((prev) =>
        [
          {
            id: result.id,
            amountDisplay,
            symbol: selectedAsset.symbol,
            walletAddress: selectedWallet.address,
            txHash: result.txHash,
            chainId: chainIdOf(selectedWallet.networkId),
          },
          ...prev,
        ].slice(0, RECENT_LIMIT),
      );
      resetForm();
    } catch (error) {
      setBanner(
        error instanceof ApiError
          ? messages.errorByCode[error.code] ?? error.message
          : messages.common.genericError,
      );
    }
  };

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-8">
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

        {/* 1 — Kullanıcı */}
        <UserPicker
          query={userQuery}
          onQueryChange={setUserQuery}
          selectedUser={selectedUser}
          onPick={pickUser}
          onClear={resetForm}
        />

        {/* 2 — Cüzdan */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="walletId" className="text-sm font-medium text-zinc-900">
            {t.walletLabel}
          </label>
          <select
            id="walletId"
            disabled={!selectedUser || wallets.isPending}
            value={walletId}
            onChange={(event) => changeWallet(event.target.value)}
            className="h-10 rounded-md border border-border bg-white px-3 text-sm text-zinc-900 outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">{t.walletPlaceholder}</option>
            {wallets.data?.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {walletOptionLabel(wallet, networkName(wallet.networkId))}
              </option>
            ))}
          </select>
          {selectedUser && wallets.isPending ? (
            <p className="text-xs text-muted-foreground">{t.walletLoading}</p>
          ) : null}
          {selectedUser && wallets.isError ? (
            <p role="alert" className="text-xs text-danger">
              {t.walletError}
            </p>
          ) : null}
          {selectedUser && wallets.data?.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t.walletEmpty}</p>
          ) : null}
        </div>

        {/* 3 — Varlık: yalnızca cüzdan seçiliyken mount edilir (useNetworkAssets
            "Dokunma" listesinde — enabled parametresi yok, mount ile kontrol edilir) */}
        {selectedWallet ? (
          <AssetSelect
            networkId={selectedWallet.networkId}
            value={assetId}
            onChange={changeAsset}
            onOptionsChange={setAssetOptions}
          />
        ) : (
          <DisabledSelect label={t.assetLabel} placeholder={t.assetPlaceholder} />
        )}

        {/* 4 — Tutar */}
        <Field
          id="amount"
          label={t.amountLabel}
          inputMode="decimal"
          autoComplete="off"
          placeholder={t.amountPlaceholder}
          disabled={!assetId}
          value={amountInput}
          onChange={(event) => setAmountInput(event.target.value)}
          error={amountError ?? undefined}
        />

        <div>
          <Button type="submit" disabled={!canSubmit}>
            {mint.isPending ? t.submitting : t.submit}
          </Button>
        </div>
      </form>

      <RecentMints rows={recent} />
    </section>
  );
}

function walletOptionLabel(wallet: WalletListItem, networkLabel: string): string {
  const short =
    wallet.address.length <= 12
      ? wallet.address
      : `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
  const typeLabel =
    wallet.type === "managed"
      ? messages.wallets.typeManaged
      : messages.wallets.typeWatchOnly;
  return `${networkLabel} · ${typeLabel} · ${short}`;
}

function UserPicker({
  query,
  onQueryChange,
  selectedUser,
  onPick,
  onClear,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  selectedUser: AdminUserRow | null;
  onPick: (user: AdminUserRow) => void;
  onClear: () => void;
}) {
  const search = useAdminUserSearch(query);

  if (selectedUser) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-900">{t.userLabel}</span>
        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
          <span className="text-sm text-zinc-900">
            {t.userSelectedPrefix} {selectedUser.email}
          </span>
          <Button variant="secondary" onClick={onClear}>
            {t.userChange}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Field
        id="userSearch"
        label={t.userLabel}
        type="search"
        autoComplete="off"
        placeholder={t.userSearchPlaceholder}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />

      {!search.active ? (
        <p className="text-xs text-muted-foreground">{t.userSearchHint}</p>
      ) : search.isPending ? (
        <p className="text-xs text-muted-foreground">{t.userSearching}</p>
      ) : search.isError ? (
        <p role="alert" className="text-xs text-danger">
          {t.userSearchError}
        </p>
      ) : search.data && search.data.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t.userSearchEmpty}</p>
      ) : search.data ? (
        <ul className="flex flex-col overflow-hidden rounded-md border border-border">
          {search.data.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => onPick(user)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-zinc-900 transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
              >
                <span>{user.email}</span>
                {user.role === "admin" ? (
                  <span className="text-xs text-muted-foreground">admin</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AssetSelect({
  networkId,
  value,
  onChange,
  onOptionsChange,
}: {
  networkId: string;
  value: string;
  onChange: (assetId: string) => void;
  onOptionsChange: (assets: NetworkAsset[]) => void;
}) {
  const assets = useNetworkAssets(networkId);

  // Mint yalnızca aktif + mock kontrat tabanlı varlıklar için anlamlıdır (native
  // ETH/BNB/TRX mint edilemez → backend RESOURCE_NOT_FOUND döner).
  const mintable = useMemo(
    () =>
      (assets.data ?? []).filter(
        (a) => a.isActive && a.contractAddress !== null,
      ),
    [assets.data],
  );

  useEffect(() => {
    onOptionsChange(mintable);
  }, [mintable, onOptionsChange]);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="assetId" className="text-sm font-medium text-zinc-900">
        {t.assetLabel}
      </label>
      <select
        id="assetId"
        disabled={assets.isPending || mintable.length === 0}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-md border border-border bg-white px-3 text-sm text-zinc-900 outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">{t.assetPlaceholder}</option>
        {mintable.map((asset) => (
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
      {!assets.isPending && !assets.isError && mintable.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t.assetEmpty}</p>
      ) : null}
    </div>
  );
}

function DisabledSelect({
  label,
  placeholder,
}: {
  label: string;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-900">{label}</span>
      <select
        disabled
        aria-label={label}
        className="h-10 rounded-md border border-border bg-white px-3 text-sm text-muted-foreground opacity-50"
      >
        <option>{placeholder}</option>
      </select>
    </div>
  );
}

function RecentMints({ rows }: { rows: RecentMint[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-zinc-900">{t.recentTitle}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.recentEmpty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">{t.recentColumnAmount}</th>
                <th className="py-2 pr-4 font-medium">{t.recentColumnWallet}</th>
                <th className="py-2 font-medium">{t.recentColumnTx}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="py-2 pr-4 text-zinc-900">
                    {row.amountDisplay} {row.symbol}
                  </td>
                  <td className="py-2 pr-4">
                    <AddressDisplay address={row.walletAddress} />
                  </td>
                  <td className="py-2">
                    <ExplorerLink chainId={row.chainId} txHash={row.txHash} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
