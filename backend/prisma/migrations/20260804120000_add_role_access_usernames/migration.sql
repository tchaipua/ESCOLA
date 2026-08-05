ALTER TABLE "teachers" ADD COLUMN "accessUsername" TEXT;
ALTER TABLE "students" ADD COLUMN "accessUsername" TEXT;
ALTER TABLE "guardians" ADD COLUMN "accessUsername" TEXT;

CREATE UNIQUE INDEX "teachers_tenantId_accessUsername_key"
ON "teachers"("tenantId", "accessUsername");

CREATE UNIQUE INDEX "students_tenantId_accessUsername_key"
ON "students"("tenantId", "accessUsername");

CREATE UNIQUE INDEX "guardians_tenantId_accessUsername_key"
ON "guardians"("tenantId", "accessUsername");
