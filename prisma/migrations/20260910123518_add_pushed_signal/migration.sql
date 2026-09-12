-- CreateTable
CREATE TABLE "PushedSignal" (
    "id" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "pushedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushedSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushedSignal_mint_key" ON "PushedSignal"("mint");
