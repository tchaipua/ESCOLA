ALTER TABLE "tenant_branches"
ALTER COLUMN "allowProductImageEdit" SET DEFAULT true;

UPDATE "tenant_branches"
SET "allowProductImageEdit" = true
WHERE "allowProductImageEdit" = false;
