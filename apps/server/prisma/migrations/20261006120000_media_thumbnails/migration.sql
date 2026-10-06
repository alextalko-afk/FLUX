-- Server-generated JPEG preview for images. See the `FileObject` model in
-- schema.prisma. Null means "not generated" (non-image, avatar, or legacy row).
ALTER TABLE "FileObject" ADD COLUMN "thumbnailKey" TEXT;
