-- CreateTable
CREATE TABLE "SignalCache" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalCache_pkey" PRIMARY KEY ("id")
);
