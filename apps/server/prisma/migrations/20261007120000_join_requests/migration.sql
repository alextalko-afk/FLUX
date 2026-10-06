ALTER TABLE "Chat" ADD COLUMN "joinApproval" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "JoinRequest" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JoinRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JoinRequest_chatId_userId_key" ON "JoinRequest"("chatId", "userId");
CREATE INDEX "JoinRequest_chatId_idx" ON "JoinRequest"("chatId");
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
