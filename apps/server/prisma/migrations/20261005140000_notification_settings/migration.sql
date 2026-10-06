-- Per-user notification preferences.
--
-- Previously `NotificationsService.getSettings` returned hard-coded values and
-- `updateSettings` echoed the request body without persisting anything, so the
-- settings screen could not actually change behaviour.
CREATE TABLE "NotificationSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "showPreview" BOOLEAN NOT NULL DEFAULT true,
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "privateChats" BOOLEAN NOT NULL DEFAULT true,
    "groupChats" BOOLEAN NOT NULL DEFAULT true,
    "channels" BOOLEAN NOT NULL DEFAULT true,
    "mentions" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationSettings_userId_key" ON "NotificationSettings"("userId");

CREATE INDEX "NotificationSettings_userId_idx" ON "NotificationSettings"("userId");

ALTER TABLE "NotificationSettings"
  ADD CONSTRAINT "NotificationSettings_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
