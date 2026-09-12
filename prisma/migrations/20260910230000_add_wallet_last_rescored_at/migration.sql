-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN "lastRescoredAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Wallet_lastRescoredAt_idx" ON "Wallet"("lastRescoredAt");
