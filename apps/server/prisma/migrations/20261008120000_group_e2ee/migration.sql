ALTER TABLE "Chat" ADD COLUMN "e2ee" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "keyEpoch" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "GroupKeyShare" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceKeyId" TEXT NOT NULL,
    "sealed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GroupKeyShare_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GroupKeyShare_chatId_epoch_userId_key" ON "GroupKeyShare"("chatId", "epoch", "userId");
CREATE INDEX "GroupKeyShare_chatId_userId_idx" ON "GroupKeyShare"("chatId", "userId");
ALTER TABLE "GroupKeyShare" ADD CONSTRAINT "GroupKeyShare_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupKeyShare" ADD CONSTRAINT "GroupKeyShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupKeyShare" ADD CONSTRAINT "GroupKeyShare_deviceKeyId_fkey" FOREIGN KEY ("deviceKeyId") REFERENCES "DeviceKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
