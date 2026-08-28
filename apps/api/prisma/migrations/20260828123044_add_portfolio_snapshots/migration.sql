-- CreateTable
CREATE TABLE "portfolio_snapshots" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "total_value_usdt" DECIMAL(38,18) NOT NULL,
    "price_source" TEXT NOT NULL DEFAULT 'coingecko',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portfolio_snapshots_user_id_created_at_idx" ON "portfolio_snapshots"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
