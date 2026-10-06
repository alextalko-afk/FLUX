-- One pin per message, linked to the message so deleting it unpins it.
ALTER TABLE "PinnedMessage" ADD COLUMN "pinnedById" TEXT;

CREATE UNIQUE INDEX "PinnedMessage_messageId_key" ON "PinnedMessage"("messageId");

ALTER TABLE "PinnedMessage"
  ADD CONSTRAINT "PinnedMessage_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
