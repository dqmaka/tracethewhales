-- CreateTable
CREATE TABLE "SignalOutcome" (
    "id" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "convictionScore" INTEGER NOT NULL,
    "pushedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priceAtPush" DOUBLE PRECISION,
    "liquidityAtPushUsd" DOUBLE PRECISION,
    "price1h" DOUBLE PRECISION,
    "price6h" DOUBLE PRECISION,
    "price24h" DOUBLE PRECISION,
    "price48h" DOUBLE PRECISION,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SignalOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignalOutcome_pushedAt_idx" ON "SignalOutcome"("pushedAt");

-- CreateIndex
CREATE INDEX "SignalOutcome_completedAt_idx" ON "SignalOutcome"("completedAt");
