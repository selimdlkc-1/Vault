-- CreateEnum
CREATE TYPE "movement_direction" AS ENUM ('incoming', 'outgoing');

-- CreateTable
CREATE TABLE "chain_movements" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "direction" "movement_direction" NOT NULL,
    "amount" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chain_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chain_movements_wallet_id_occurred_at_idx" ON "chain_movements"("wallet_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "chain_movements_tx_hash_idx" ON "chain_movements"("tx_hash");

-- CreateIndex
CREATE UNIQUE INDEX "chain_movements_wallet_id_tx_hash_direction_key" ON "chain_movements"("wallet_id", "tx_hash", "direction");

-- AddForeignKey
ALTER TABLE "chain_movements" ADD CONSTRAINT "chain_movements_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chain_movements" ADD CONSTRAINT "chain_movements_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
