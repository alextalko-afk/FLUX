-- Link refresh tokens to the login session that issued them.
--
-- Previously "terminate session" could only flip `Session.isActive`; the
-- refresh token remained valid, so a terminated device could keep minting new
-- access tokens. The foreign key lets session termination revoke its tokens too.
ALTER TABLE "RefreshToken" ADD COLUMN     "sessionId" TEXT;

CREATE INDEX "RefreshToken_sessionId_idx" ON "RefreshToken"("sessionId");

ALTER TABLE "RefreshToken"
  ADD CONSTRAINT "RefreshToken_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
