-- CreateTable
CREATE TABLE "SubscriberCursor" (
    "contractId" TEXT NOT NULL,
    "ledger" INTEGER NOT NULL,
    "hzCursor" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriberCursor_pkey" PRIMARY KEY ("contractId")
);
