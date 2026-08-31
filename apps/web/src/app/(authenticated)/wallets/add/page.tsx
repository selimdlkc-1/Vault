"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  useForm,
  type FieldValues,
  type Path,
  type UseFormRegister,
} from "react-hook-form";
import {
  createManagedWalletSchema,
  createWatchOnlyWalletSchema,
  type CreateManagedWalletInput,
  type CreateWatchOnlyWalletInput,
} from "@vault/types";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useToast } from "@/context/toast-context";
import { useCreateManagedWallet } from "@/hooks/use-create-managed-wallet";
import { useCreateWatchOnlyWallet } from "@/hooks/use-create-watch-only-wallet";
import { useNetworks } from "@/hooks/use-networks";
import { ApiError } from "@/lib/api-client";
import { messages } from "@/lib/messages";

const t = messages.walletAdd;

/**
 * Cüzdan ekleme akışı (docs/06_SCREEN_CATALOG.md §4.2). `/wallets/add`:
 * - `?type=watch-only` → S-WALLET-ADD-WATCHONLY (harici adres izleme)
 * - `?type=managed`   → S-WALLET-ADD-MANAGED (sistemin türettiği yönetilen cüzdan, Faz 4 §4.3)
 * - type yok / bilinmeyen → tip seçim ekranı (akış diyagramı "Tip seçimi" düğümü)
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

  if (type === "watch-only") return <WatchOnlyForm />;
  if (type === "managed") return <ManagedForm />;
  return <TypeChoice />;
}

/** Tip seçim ekranı — "Cüzdan Ekle" iki alt akışa ayrılır. */
function TypeChoice() {
  return (
    <section className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-900">{t.choiceTitle}</h1>
      <div className="flex flex-col gap-3">
        <ChoiceCard
          href="/wallets/add?type=watch-only"
          title={t.choiceWatchOnlyTitle}
          description={t.choiceWatchOnlyDesc}
        />
        <ChoiceCard
          href="/wallets/add?type=managed"
          title={t.choiceManagedTitle}
          description={t.choiceManagedDesc}
        />
      </div>
      <Link href="/wallets" className={buttonClasses("secondary")}>
        {t.cancel}
      </Link>
    </section>
  );
}

function ChoiceCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span className="text-sm font-medium text-zinc-900">{title}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </Link>
  );
}

/**
 * Ağ seçimi — hem watch-only hem managed formunda aynı `<select>`. `useNetworks`
 * yüklenene kadar disabled. Ağın kendisi aktif/pasif olmaz; aktivasyon
 * `(network, asset)` düzeyinde ve yalnızca backend'de zorlanır — burada tüm ağlar
 * listelenir, kapalı ağ seçilirse backend `NETWORK_ASSET_INACTIVE` döner.
 */
function NetworkSelect<T extends FieldValues>({
  register,
  error,
  disabled,
}: {
  register: UseFormRegister<T>;
  error?: string;
  disabled: boolean;
}) {
  const networks = useNetworks();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="networkId" className="text-sm font-medium text-zinc-900">
        {t.networkLabel}
      </label>
      <select
        id="networkId"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "networkId-error" : undefined}
        disabled={disabled || networks.isPending}
        className="h-10 rounded-md border border-border bg-white px-3 text-sm text-zinc-900 outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary aria-[invalid=true]:border-danger"
        {...register("networkId" as Path<T>)}
      >
        <option value="">{t.networkPlaceholder}</option>
        {networks.data?.map((network) => (
          <option key={network.id} value={network.id}>
            {network.name}
          </option>
        ))}
      </select>
      {error ? (
        <p id="networkId-error" role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function WatchOnlyForm() {
  const router = useRouter();
  const createWallet = useCreateWatchOnlyWallet();
  const [banner, setBanner] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateWatchOnlyWalletInput>({
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
        setError("address", { message: messages.errorByCode[error.code] });
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
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {banner}
          </p>
        ) : null}

        <NetworkSelect
          register={register}
          error={errors.networkId?.message}
          disabled={isSubmitting}
        />

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

/**
 * S-WALLET-ADD-MANAGED (docs/06_SCREEN_CATALOG.md §4.2, Faz 4 §4.3). Tek alan: Ağ.
 * "Cüzdan Oluştur" backend'de HD türetme + envelope encryption tetikler; bu adım
 * senkron sürdüğü için buton `isPending` boyunca "Oluşturuluyor..." gösterir.
 * Başarıda `/wallets/[id]`'e yönlendirme + "Yönetilen cüzdanınız oluşturuldu."
 * toast'ı (rota değişse de görünür). Tek hata kodu: `NETWORK_ASSET_INACTIVE`.
 */
function ManagedForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const createWallet = useCreateManagedWallet();
  const [banner, setBanner] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateManagedWalletInput>({
    resolver: zodResolver(createManagedWalletSchema),
    mode: "onBlur",
    defaultValues: { networkId: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null);
    try {
      const created = await createWallet.mutateAsync(values);
      showToast(t.managedCreatedToast);
      router.replace(`/wallets/${created.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.code === "NETWORK_ASSET_INACTIVE") {
        setError("networkId", {
          message: messages.errorByCode.NETWORK_ASSET_INACTIVE,
        });
        return;
      }
      setBanner(
        error instanceof ApiError
          ? messages.errorByCode[error.code] ?? error.message
          : messages.common.genericError,
      );
    }
  });

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-900">{t.managedTitle}</h1>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {banner ? (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {banner}
          </p>
        ) : null}

        <NetworkSelect
          register={register}
          error={errors.networkId?.message}
          disabled={isSubmitting}
        />

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t.managedSubmitting : t.managedSubmit}
          </Button>
          <Link href="/wallets" className={buttonClasses("secondary")}>
            {t.cancel}
          </Link>
        </div>
      </form>
    </section>
  );
}
