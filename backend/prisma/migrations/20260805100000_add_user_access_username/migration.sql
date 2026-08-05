ALTER TABLE "users" ADD COLUMN "accessUsername" TEXT;

CREATE UNIQUE INDEX "users_tenantId_accessUsername_key"
ON "users"("tenantId", "accessUsername");
