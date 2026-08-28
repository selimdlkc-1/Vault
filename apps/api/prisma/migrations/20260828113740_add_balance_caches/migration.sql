-- CreateTable
CREATE TABLE "balance_caches" (
    "wallet_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "balance_raw" TEXT NOT NULL DEFAULT '0',
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_caches_pkey" PRIMARY KEY ("wallet_id","asset_id")
);

-- AddForeignKey
ALTER TABLE "balance_caches" ADD CONSTRAINT "balance_caches_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balance_caches" ADD CONSTRAINT "balance_caches_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
