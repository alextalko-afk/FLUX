-- CreateTable
CREATE TABLE "StickerPack" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StickerPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sticker" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "fileObjectId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "Sticker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StickerPackInstall" (
    "userId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StickerPackInstall_pkey" PRIMARY KEY ("userId","packId")
);

-- CreateIndex
CREATE INDEX "StickerPack_ownerId_idx" ON "StickerPack"("ownerId");

-- CreateIndex
CREATE INDEX "Sticker_packId_idx" ON "Sticker"("packId");

-- AddForeignKey
ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_packId_fkey" FOREIGN KEY ("packId") REFERENCES "StickerPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StickerPackInstall" ADD CONSTRAINT "StickerPackInstall_packId_fkey" FOREIGN KEY ("packId") REFERENCES "StickerPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
