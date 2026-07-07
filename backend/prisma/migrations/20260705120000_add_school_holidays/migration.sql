CREATE TABLE "school_holidays" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "year" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "holidayType" TEXT NOT NULL,
    "appliesTo" TEXT NOT NULL DEFAULT 'TODAS AS TURMAS',
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "school_holidays_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "school_holidays_tenantId_idx" ON "school_holidays"("tenantId");
CREATE INDEX "school_holidays_tenantId_branchCode_year_idx" ON "school_holidays"("tenantId", "branchCode", "year");
CREATE INDEX "school_holidays_date_idx" ON "school_holidays"("date");
