ALTER TABLE "tenants" ADD COLUMN "centralTenantId" TEXT;
ALTER TABLE "tenants" ADD COLUMN "centralTenantCode" TEXT;
ALTER TABLE "email_credentials" ADD COLUMN "centralIdentityAccountId" TEXT;

CREATE UNIQUE INDEX "tenants_centralTenantId_key"
ON "tenants"("centralTenantId");

CREATE UNIQUE INDEX "tenants_centralTenantCode_key"
ON "tenants"("centralTenantCode");

CREATE UNIQUE INDEX "email_credentials_centralIdentityAccountId_key"
ON "email_credentials"("centralIdentityAccountId");
