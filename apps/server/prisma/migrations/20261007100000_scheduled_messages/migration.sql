CREATE TABLE "ScheduledMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "entities" JSONB,
    "replyToMessageId" TEXT,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduledMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ScheduledMessage_sendAt_idx" ON "ScheduledMessage"("sendAt");
CREATE INDEX "ScheduledMessage_chatId_userId_idx" ON "ScheduledMessage"("chatId", "userId");
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
