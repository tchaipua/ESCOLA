CREATE TABLE "teacher_branch_accesses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "teacher_branch_accesses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "teacher_branch_accesses_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "student_branch_accesses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "student_branch_accesses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "student_branch_accesses_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "guardian_branch_accesses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "guardian_branch_accesses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "guardian_branch_accesses_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "teacher_branch_accesses_tenantId_teacherId_branchCode_key" ON "teacher_branch_accesses"("tenantId", "teacherId", "branchCode");
CREATE INDEX "teacher_branch_accesses_tenantId_teacherId_canceledAt_idx" ON "teacher_branch_accesses"("tenantId", "teacherId", "canceledAt");
CREATE INDEX "teacher_branch_accesses_tenantId_branchCode_canceledAt_idx" ON "teacher_branch_accesses"("tenantId", "branchCode", "canceledAt");

CREATE UNIQUE INDEX "student_branch_accesses_tenantId_studentId_branchCode_key" ON "student_branch_accesses"("tenantId", "studentId", "branchCode");
CREATE INDEX "student_branch_accesses_tenantId_studentId_canceledAt_idx" ON "student_branch_accesses"("tenantId", "studentId", "canceledAt");
CREATE INDEX "student_branch_accesses_tenantId_branchCode_canceledAt_idx" ON "student_branch_accesses"("tenantId", "branchCode", "canceledAt");

CREATE UNIQUE INDEX "guardian_branch_accesses_tenantId_guardianId_branchCode_key" ON "guardian_branch_accesses"("tenantId", "guardianId", "branchCode");
CREATE INDEX "guardian_branch_accesses_tenantId_guardianId_canceledAt_idx" ON "guardian_branch_accesses"("tenantId", "guardianId", "canceledAt");
CREATE INDEX "guardian_branch_accesses_tenantId_branchCode_canceledAt_idx" ON "guardian_branch_accesses"("tenantId", "branchCode", "canceledAt");
