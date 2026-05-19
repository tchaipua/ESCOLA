PRAGMA foreign_keys=OFF;

CREATE TABLE "new_tenant_branches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "document" TEXT,
    "rg" TEXT,
    "cpf" TEXT,
    "cnpj" TEXT,
    "nickname" TEXT,
    "corporateName" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "cellphone1" TEXT,
    "cellphone2" TEXT,
    "email" TEXT,
    "zipCode" TEXT,
    "street" TEXT,
    "number" TEXT,
    "city" TEXT,
    "state" TEXT,
    "neighborhood" TEXT,
    "complement" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "tenant_branches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_tenant_branches" (
    "id",
    "tenantId",
    "branchCode",
    "name",
    "logoUrl",
    "document",
    "rg",
    "cpf",
    "cnpj",
    "nickname",
    "corporateName",
    "phone",
    "whatsapp",
    "cellphone1",
    "cellphone2",
    "email",
    "zipCode",
    "street",
    "number",
    "city",
    "state",
    "neighborhood",
    "complement",
    "isActive",
    "createdAt",
    "createdBy",
    "updatedAt",
    "updatedBy",
    "canceledAt",
    "canceledBy"
)
SELECT
    "id",
    "tenantId",
    "branchCode",
    "name",
    "logoUrl",
    "document",
    "rg",
    "cpf",
    "cnpj",
    "nickname",
    "corporateName",
    "phone",
    "whatsapp",
    "cellphone1",
    "cellphone2",
    "email",
    "zipCode",
    "street",
    "number",
    "city",
    "state",
    "neighborhood",
    "complement",
    "isActive",
    "createdAt",
    "createdBy",
    "updatedAt",
    "updatedBy",
    "canceledAt",
    "canceledBy"
FROM "tenant_branches";

DROP TABLE "tenant_branches";
ALTER TABLE "new_tenant_branches" RENAME TO "tenant_branches";

CREATE UNIQUE INDEX "tenant_branches_tenantId_branchCode_key" ON "tenant_branches"("tenantId", "branchCode");
CREATE INDEX "tenant_branches_tenantId_isActive_name_idx" ON "tenant_branches"("tenantId", "isActive", "name");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
