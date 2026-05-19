ALTER TABLE "tenant_branches" ADD COLUMN "logoUrl" TEXT;

UPDATE "tenant_branches"
SET
  "logoUrl" = COALESCE("tenant_branches"."logoUrl", (
    SELECT "logoUrl" FROM "tenants" WHERE "tenants"."id" = "tenant_branches"."tenantId"
  )),
  "document" = COALESCE("tenant_branches"."document", (
    SELECT "document" FROM "tenants" WHERE "tenants"."id" = "tenant_branches"."tenantId"
  )),
  "rg" = COALESCE("tenant_branches"."rg", (
    SELECT "rg" FROM "tenants" WHERE "tenants"."id" = "tenant_branches"."tenantId"
  )),
  "cpf" = COALESCE("tenant_branches"."cpf", (
    SELECT "cpf" FROM "tenants" WHERE "tenants"."id" = "tenant_branches"."tenantId"
  )),
  "cnpj" = COALESCE("tenant_branches"."cnpj", (
    SELECT "cnpj" FROM "tenants" WHERE "tenants"."id" = "tenant_branches"."tenantId"
  )),
  "nickname" = COALESCE("tenant_branches"."nickname", (
    SELECT "nickname" FROM "tenants" WHERE "tenants"."id" = "tenant_branches"."tenantId"
  )),
  "corporateName" = COALESCE("tenant_branches"."corporateName", (
    SELECT "corporateName" FROM "tenants" WHERE "tenants"."id" = "tenant_branches"."tenantId"
  )),
  "phone" = COALESCE("tenant_branches"."phone", (
    SELECT "phone" FROM "tenants" WHERE "tenants"."id" = "tenant_branches"."tenantId"
  )),
  "whatsapp" = COALESCE("tenant_branches"."whatsapp", (
    SELECT "whatsapp" FROM "tenants" WHERE "tenants"."id" = "tenant_branches"."tenantId"
  )),
  "cellphone1" = COALESCE("tenant_branches"."cellphone1", (
    SELECT "cellphone1" FROM "tenants" WHERE "tenants"."id" = "tenant_branches"."tenantId"
  )),
  "cellphone2" = COALESCE("tenant_branches"."cellphone2", (
    SELECT "cellphone2" FROM "tenants" WHERE "tenants"."id" = "tenant_branches"."tenantId"
  )),
  "email" = COALESCE("tenant_branches"."email", (
    SELECT "email" FROM "tenants" WHERE "tenants"."id" = "tenant_branches"."tenantId"
  )),
  "zipCode" = COALESCE("tenant_branches"."zipCode", (
    SELECT "zipCode" FROM "tenants" WHERE "tenants"."id" = "tenant_branches"."tenantId"
  )),
  "street" = COALESCE("tenant_branches"."street", (
    SELECT "street" FROM "tenants" WHERE "tenants"."id" = "tenant_branches"."tenantId"
  )),
  "number" = COALESCE("tenant_branches"."number", (
    SELECT "number" FROM "tenants" WHERE "tenants"."id" = "tenant_branches"."tenantId"
  )),
  "city" = COALESCE("tenant_branches"."city", (
    SELECT "city" FROM "tenants" WHERE "tenants"."id" = "tenant_branches"."tenantId"
  )),
  "state" = COALESCE("tenant_branches"."state", (
    SELECT "state" FROM "tenants" WHERE "tenants"."id" = "tenant_branches"."tenantId"
  )),
  "neighborhood" = COALESCE("tenant_branches"."neighborhood", (
    SELECT "neighborhood" FROM "tenants" WHERE "tenants"."id" = "tenant_branches"."tenantId"
  )),
  "complement" = COALESCE("tenant_branches"."complement", (
    SELECT "complement" FROM "tenants" WHERE "tenants"."id" = "tenant_branches"."tenantId"
  ))
WHERE "branchCode" = 1;

UPDATE "tenants"
SET
  "logoUrl" = NULL,
  "document" = NULL,
  "rg" = NULL,
  "cpf" = NULL,
  "cnpj" = NULL,
  "nickname" = NULL,
  "corporateName" = NULL,
  "phone" = NULL,
  "whatsapp" = NULL,
  "cellphone1" = NULL,
  "cellphone2" = NULL,
  "email" = NULL,
  "zipCode" = NULL,
  "street" = NULL,
  "number" = NULL,
  "city" = NULL,
  "state" = NULL,
  "neighborhood" = NULL,
  "complement" = NULL;
