PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_series" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "sortOrder" INTEGER,
    "nextSeriesId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "series_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "series_nextSeriesId_fkey" FOREIGN KEY ("nextSeriesId") REFERENCES "series" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_series" ("id", "tenantId", "branchCode", "name", "code", "sortOrder", "createdAt", "createdBy", "updatedAt", "updatedBy", "canceledAt", "canceledBy")
SELECT "id", "tenantId", "branchCode", "name", "code", "sortOrder", "createdAt", "createdBy", "updatedAt", "updatedBy", "canceledAt", "canceledBy"
FROM "series";

DROP TABLE "series";
ALTER TABLE "new_series" RENAME TO "series";
CREATE INDEX "series_tenantId_idx" ON "series"("tenantId");
CREATE INDEX "series_nextSeriesId_idx" ON "series"("nextSeriesId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
