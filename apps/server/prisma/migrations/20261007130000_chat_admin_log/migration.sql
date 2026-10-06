CREATE TABLE "ChatAdminLog" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetUserId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatAdminLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ChatAdminLog_chatId_createdAt_idx" ON "ChatAdminLog"("chatId", "createdAt");
ALTER TABLE "ChatAdminLog" ADD CONSTRAINT "ChatAdminLog_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
