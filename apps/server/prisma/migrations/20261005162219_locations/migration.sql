-- CreateTable
CREATE TABLE "MessageLocation" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "label" TEXT,
    "liveUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageLocation_messageId_key" ON "MessageLocation"("messageId");

-- AddForeignKey
ALTER TABLE "MessageLocation" ADD CONSTRAINT "MessageLocation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
