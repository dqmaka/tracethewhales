-- CreateTable
CREATE TABLE "WalletDiscoveryOutcome" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "initialScore" INTEGER NOT NULL,
    "initialPnl30d" DOUBLE PRECISION NOT NULL,
    "score7d" INTEGER,
    "score14d" INTEGER,
    "score30d" INTEGER,
    "stillWatched7d" BOOLEAN,
    "stillWatched14d" BOOLEAN,
    "stillWatched30d" BOOLEAN,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WalletDiscoveryOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WalletDiscoveryOutcome_discoveredAt_idx" ON "WalletDiscoveryOutcome"("discoveredAt");

-- CreateIndex
CREATE INDEX "WalletDiscoveryOutcome_completedAt_idx" ON "WalletDiscoveryOutcome"("completedAt");
