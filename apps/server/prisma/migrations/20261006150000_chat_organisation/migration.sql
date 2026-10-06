-- Per-member chat state: pinned, archived, and a read cursor that drives unread counters.
ALTER TABLE "ChatMember"
  ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pinnedAt" TIMESTAMP(3),
  ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastReadAt" TIMESTAMP(3);

-- Existing conversations start fully read instead of showing their whole history as unread.
UPDATE "ChatMember" SET "lastReadAt" = CURRENT_TIMESTAMP;

CREATE INDEX "ChatMember_userId_isArchived_idx" ON "ChatMember"("userId", "isArchived");
CREATE INDEX "Message_chatId_createdAt_idx" ON "Message"("chatId", "createdAt");

-- Personal chat folders.
CREATE TABLE "ChatFolder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatFolder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatFolderAssignment" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatFolderAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatFolder_userId_idx" ON "ChatFolder"("userId");
CREATE INDEX "ChatFolderAssignment_chatId_idx" ON "ChatFolderAssignment"("chatId");
CREATE UNIQUE INDEX "ChatFolderAssignment_folderId_chatId_key" ON "ChatFolderAssignment"("folderId", "chatId");

ALTER TABLE "ChatFolder" ADD CONSTRAINT "ChatFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatFolderAssignment" ADD CONSTRAINT "ChatFolderAssignment_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ChatFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatFolderAssignment" ADD CONSTRAINT "ChatFolderAssignment_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
