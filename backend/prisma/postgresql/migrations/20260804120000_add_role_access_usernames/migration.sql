ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "accessUsername" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "accessUsername" TEXT;
ALTER TABLE "guardians" ADD COLUMN IF NOT EXISTS "accessUsername" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "teachers_tenantId_accessUsername_key"
ON "teachers"("tenantId", "accessUsername");

CREATE UNIQUE INDEX IF NOT EXISTS "students_tenantId_accessUsername_key"
ON "students"("tenantId", "accessUsername");

CREATE UNIQUE INDEX IF NOT EXISTS "guardians_tenantId_accessUsername_key"
ON "guardians"("tenantId", "accessUsername");
