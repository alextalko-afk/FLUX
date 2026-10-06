-- CreateTable
CREATE TABLE "GroupCall" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "startedById" TEXT NOT NULL,
    "withVideo" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "GroupCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupCallParticipant" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "GroupCallParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupCall_chatId_endedAt_idx" ON "GroupCall"("chatId", "endedAt");

-- CreateIndex
CREATE INDEX "GroupCallParticipant_callId_leftAt_idx" ON "GroupCallParticipant"("callId", "leftAt");

-- CreateIndex
CREATE INDEX "GroupCallParticipant_userId_idx" ON "GroupCallParticipant"("userId");

-- AddForeignKey
ALTER TABLE "GroupCallParticipant" ADD CONSTRAINT "GroupCallParticipant_callId_fkey" FOREIGN KEY ("callId") REFERENCES "GroupCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
