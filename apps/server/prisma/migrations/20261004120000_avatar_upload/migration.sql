-- Track who uploaded a file and what kind of file it is.
--
-- `mediaType` is what makes avatars work: `completeUpload` previously had no
-- way to know that a finished upload was an avatar, so the image landed in S3
-- and was never attached to any user profile.
ALTER TABLE "FileObject" ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "mediaType" TEXT;

CREATE INDEX "FileObject_ownerId_idx" ON "FileObject"("ownerId");

CREATE INDEX "FileObject_mediaType_idx" ON "FileObject"("mediaType");
