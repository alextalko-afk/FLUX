-- Adds a moderation flag used by the admin panel.
--
-- `AdminService.performChatAction` previously accepted ARCHIVE / UNARCHIVE but
-- only wrote an audit entry, so the action silently did nothing. A chat now
-- carries an explicit archive state that the action can flip and that the
-- user-facing chat list can filter on.
ALTER TABLE "Chat" ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Chat_isArchived_idx" ON "Chat"("isArchived");
