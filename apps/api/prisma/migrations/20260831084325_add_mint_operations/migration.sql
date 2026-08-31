-- CreateTable
CREATE TABLE "mint_operations" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "amount" TEXT NOT NULL,
    "tx_hash" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mint_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mint_operations_wallet_id_idx" ON "mint_operations"("wallet_id");

-- AddForeignKey
ALTER TABLE "mint_operations" ADD CONSTRAINT "mint_operations_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mint_operations" ADD CONSTRAINT "mint_operations_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mint_operations" ADD CONSTRAINT "mint_operations_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
