-- CreateTable
CREATE TABLE "PushedExitSignal" (
    "id" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "pushedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushedExitSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushedExitSignal_mint_key" ON "PushedExitSignal"("mint");
