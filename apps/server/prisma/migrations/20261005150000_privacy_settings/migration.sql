-- Per-account privacy switches. See the `PrivacySettings` model in schema.prisma.
CREATE TABLE "PrivacySettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "showLastSeen" BOOLEAN NOT NULL DEFAULT true,
    "showOnlineStatus" BOOLEAN NOT NULL DEFAULT true,
    "showProfilePhoto" BOOLEAN NOT NULL DEFAULT true,
    "showBio" BOOLEAN NOT NULL DEFAULT true,
    "showPhoneNumber" BOOLEAN NOT NULL DEFAULT false,
    "showReadReceipts" BOOLEAN NOT NULL DEFAULT true,
    "showTypingStatus" BOOLEAN NOT NULL DEFAULT true,
    "allowCalls" BOOLEAN NOT NULL DEFAULT true,
    "allowGroupInvites" BOOLEAN NOT NULL DEFAULT true,
    "allowMessages" BOOLEAN NOT NULL DEFAULT true,
    "allowForwarding" BOOLEAN NOT NULL DEFAULT true,
    "allowSavingMedia" BOOLEAN NOT NULL DEFAULT true,
    "allowP2P" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacySettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrivacySettings_userId_key" ON "PrivacySettings"("userId");

CREATE INDEX "PrivacySettings_userId_idx" ON "PrivacySettings"("userId");

ALTER TABLE "PrivacySettings" ADD CONSTRAINT "PrivacySettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
