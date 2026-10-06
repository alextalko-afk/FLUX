-- End-to-end encryption: one key pair per device (public half only), and the binding
-- of a secret chat to the two devices that can read it.
-- The old single-JWK column is replaced; it was never populated by a working flow.
ALTER TABLE "User" DROP COLUMN "publicKey";

CREATE TABLE "DeviceKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceKey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SecretChatBinding" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceKeyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecretChatBinding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeviceKey_userId_idx" ON "DeviceKey"("userId");
CREATE UNIQUE INDEX "DeviceKey_userId_publicKey_key" ON "DeviceKey"("userId", "publicKey");
CREATE INDEX "SecretChatBinding_deviceKeyId_idx" ON "SecretChatBinding"("deviceKeyId");
CREATE UNIQUE INDEX "SecretChatBinding_chatId_userId_key" ON "SecretChatBinding"("chatId", "userId");

ALTER TABLE "DeviceKey" ADD CONSTRAINT "DeviceKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SecretChatBinding" ADD CONSTRAINT "SecretChatBinding_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SecretChatBinding" ADD CONSTRAINT "SecretChatBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SecretChatBinding" ADD CONSTRAINT "SecretChatBinding_deviceKeyId_fkey" FOREIGN KEY ("deviceKeyId") REFERENCES "DeviceKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
