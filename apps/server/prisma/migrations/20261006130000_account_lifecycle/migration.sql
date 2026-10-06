-- Account deletion marker and hashed 2FA recovery codes.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "TwoFactorCredential" ADD COLUMN "backupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
