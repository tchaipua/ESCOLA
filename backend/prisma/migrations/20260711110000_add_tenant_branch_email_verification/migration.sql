ALTER TABLE "tenant_branches" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenant_branches" ADD COLUMN "emailVerifiedAt" DATETIME;
ALTER TABLE "tenant_branches" ADD COLUMN "emailVerificationToken" TEXT;
ALTER TABLE "tenant_branches" ADD COLUMN "emailVerificationExpires" DATETIME;

CREATE INDEX "tenant_branches_emailVerificationToken_idx" ON "tenant_branches"("emailVerificationToken");
