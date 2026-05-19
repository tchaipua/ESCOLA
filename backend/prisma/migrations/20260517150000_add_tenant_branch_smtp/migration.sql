ALTER TABLE "tenant_branches" ADD COLUMN "smtpHost" TEXT;
ALTER TABLE "tenant_branches" ADD COLUMN "smtpPort" INTEGER;
ALTER TABLE "tenant_branches" ADD COLUMN "smtpTimeout" INTEGER;
ALTER TABLE "tenant_branches" ADD COLUMN "smtpAuthenticate" BOOLEAN;
ALTER TABLE "tenant_branches" ADD COLUMN "smtpSecure" BOOLEAN;
ALTER TABLE "tenant_branches" ADD COLUMN "smtpAuthType" TEXT;
ALTER TABLE "tenant_branches" ADD COLUMN "smtpEmail" TEXT;
ALTER TABLE "tenant_branches" ADD COLUMN "smtpPassword" TEXT;
