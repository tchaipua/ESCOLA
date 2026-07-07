CREATE TABLE "school_year_periods" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "periodType" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "appliesTo" TEXT NOT NULL DEFAULT 'TODAS AS TURMAS',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "school_year_periods_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "school_year_periods_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "school_years" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "school_year_periods_tenantId_idx" ON "school_year_periods"("tenantId");
CREATE INDEX "school_year_periods_tenantId_branchCode_schoolYearId_idx" ON "school_year_periods"("tenantId", "branchCode", "schoolYearId");
CREATE INDEX "school_year_periods_startDate_endDate_idx" ON "school_year_periods"("startDate", "endDate");
