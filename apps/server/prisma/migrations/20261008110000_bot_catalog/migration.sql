ALTER TABLE "Bot" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Bot_isPublic_idx" ON "Bot"("isPublic");
