"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { createWatchOnlyWalletSchema, type CreateWatchOnlyWalletInput } from "@vault/types";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useCreateWatchOnlyWallet } from "@/hooks/use-create-watch-only-wallet";
import { useNetworks } from "@/hooks/use-networks";
import { ApiError } from "@/lib/api-client";
import { messages } from "@/lib/messages";

const t = messages.walletAdd;

/**
 * S-WALLET-ADD-WATCHONLY (docs/06_SCREEN_CATALOG.md §4.2). `/wallets/add?type=watch-only`.
 * Harici bir adresi izleme-amaçlı cüzdan olarak ekler. `?type=managed` Faz 4 §4.3'e
 * ait — bu iterasyonda o varyant için kısa bir bilgilendirme gösterilir.
 *
 * `useSearchParams` Next 15'te Suspense sınırı ister (build), bu yüzden içerik
 * `<Suspense>` ile sarılır.
 */
export default function WalletAddPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-64 max-w-md rounded-xl bg-muted" aria-hidden />}>
      <WalletAddContent />
    </Suspense>
  );
}

function WalletAddContent() {
  const type = useSearchParams().get("type");

  if (type !== "watch-only") {
    return (
      <section className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-border px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">{t.unsupportedType}</p>
        <Link href="/wallets" className={buttonClasses("primary")}>
          {t.cancel}
        </Link>
      </section>
    );
  }

  return <WatchOnlyForm />;
}

type FormValues = CreateWatchOnlyWalletInput;

function WatchOnlyForm() {
  const router = useRouter();
  const networks = useNetworks();
  const createWallet = useCreateWatchOnlyWallet();
  const [banner, setBanner] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(createWatchOnlyWalletSchema),
    mode: "onBlur",
    defaultValues: { networkId: "", address: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null);
    try {
      const created = await createWallet.mutateAsync(values);
      router.replace(`/wallets/${created.id}`);
    } catch (error) {
      applyError(error);
    }
  });

  const applyError = (error: unknown) => {
    if (!(error instanceof ApiError)) {
      setBanner(messages.common.genericError);
      return;
    }
    switch (error.code) {
      case "WALLET_ADDRESS_INVALID_FORMAT":
      case "WALLET_ADDRESS_ALREADY_EXISTS":
        setError("address", {
          message: messages.errorByCode[error.code],
        });
        return;
      case "NETWORK_ASSET_INACTIVE":
        setError("networkId", {
          message: messages.errorByCode.NETWORK_ASSET_INACTIVE,
        });
        return;
      default:
        setBanner(messages.errorByCode[error.code] ?? error.message);
    }
  };

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-900">{t.watchOnlyTitle}</h1>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {banner ? (
          <p
            role="alert"
            className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {banner}
          </p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="networkId"
            className="text-sm font-medium text-zinc-900"
          >
            {t.networkLabel}
          </label>
          <select
            id="networkId"
            aria-invalid={errors.networkId ? true : undefined}
            aria-describedby={errors.networkId ? "networkId-error" : undefined}
            disabled={networks.isPending}
            className="h-10 rounded-md border border-border bg-white px-3 text-sm text-zinc-900 outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary aria-[invalid=true]:border-danger"
            {...register("networkId")}
          >
            <option value="">{t.networkPlaceholder}</option>
            {networks.data?.map((network) => (
              <option key={network.id} value={network.id}>
                {network.name}
              </option>
            ))}
          </select>
          {errors.networkId ? (
            <p id="networkId-error" role="alert" className="text-xs text-danger">
              {errors.networkId.message}
            </p>
          ) : null}
        </div>

        <Field
          label={t.addressLabel}
          autoComplete="off"
          spellCheck={false}
          error={errors.address?.message}
          {...register("address")}
        />

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t.submitting : t.submit}
          </Button>
          <Link href="/wallets" className={buttonClasses("secondary")}>
            {t.cancel}
          </Link>
        </div>
      </form>
    </section>
  );
}
