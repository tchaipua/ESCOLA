ALTER TABLE "tenant_branches" ADD COLUMN "allowSaleUnitPriceEdit" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "tenant_branches" ADD COLUMN "allowSaleItemDiscount" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "tenant_branches" ADD COLUMN "groupSameProduct" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "finance_source_parameter_audit_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER,
    "sourceSystem" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "parametersJson" TEXT NOT NULL,
    "performedBy" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "finance_source_parameter_audit_events_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "finance_source_parameter_audit_events_tenantId_branchCode_occurredAt_idx"
ON "finance_source_parameter_audit_events"("tenantId", "branchCode", "occurredAt");
