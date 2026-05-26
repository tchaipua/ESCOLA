CREATE TABLE "user_branch_accesses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "user_branch_accesses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "user_branch_accesses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "user_branch_accesses" (
    "id",
    "tenantId",
    "userId",
    "branchCode",
    "isDefault",
    "createdAt",
    "createdBy",
    "updatedAt",
    "updatedBy"
)
SELECT
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    '4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6))),
    "tenantId",
    "id",
    CASE
        WHEN "branchCode" IS NULL OR "branchCode" < 1 THEN 1
        ELSE "branchCode"
    END,
    true,
    CURRENT_TIMESTAMP,
    'MIGRATION',
    CURRENT_TIMESTAMP,
    'MIGRATION'
FROM "users"
WHERE "canceledAt" IS NULL
  AND UPPER(COALESCE("role", '')) <> 'ADMIN';

CREATE UNIQUE INDEX "user_branch_accesses_tenantId_userId_branchCode_key" ON "user_branch_accesses"("tenantId", "userId", "branchCode");
CREATE INDEX "user_branch_accesses_tenantId_userId_canceledAt_idx" ON "user_branch_accesses"("tenantId", "userId", "canceledAt");
CREATE INDEX "user_branch_accesses_tenantId_branchCode_canceledAt_idx" ON "user_branch_accesses"("tenantId", "branchCode", "canceledAt");
