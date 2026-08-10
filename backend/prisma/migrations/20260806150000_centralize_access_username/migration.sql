-- O usuário de acesso pertence à pessoa mestre e é compartilhado por todos os seus perfis.
ALTER TABLE "people" ADD COLUMN "accessUsername" TEXT;

-- Migra os identificadores legados sem apagar os campos antigos.
UPDATE "people"
SET "accessUsername" = (
  SELECT UPPER(TRIM(u."accessUsername"))
  FROM "users" u
  WHERE u."personId" = "people"."id"
    AND u."canceledAt" IS NULL
    AND u."accessUsername" IS NOT NULL
    AND TRIM(u."accessUsername") <> ''
  ORDER BY u."updatedAt" DESC, u."id" ASC
  LIMIT 1
)
WHERE "accessUsername" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "users" u
    WHERE u."personId" = "people"."id"
      AND u."canceledAt" IS NULL
      AND u."accessUsername" IS NOT NULL
      AND TRIM(u."accessUsername") <> ''
  );

UPDATE "people"
SET "accessUsername" = (
  SELECT UPPER(TRIM(t."accessUsername"))
  FROM "teachers" t
  WHERE t."personId" = "people"."id"
    AND t."canceledAt" IS NULL
    AND t."accessUsername" IS NOT NULL
    AND TRIM(t."accessUsername") <> ''
  ORDER BY t."updatedAt" DESC, t."id" ASC
  LIMIT 1
)
WHERE "accessUsername" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "teachers" t
    WHERE t."personId" = "people"."id"
      AND t."canceledAt" IS NULL
      AND t."accessUsername" IS NOT NULL
      AND TRIM(t."accessUsername") <> ''
  );

UPDATE "people"
SET "accessUsername" = (
  SELECT UPPER(TRIM(s."accessUsername"))
  FROM "students" s
  WHERE s."personId" = "people"."id"
    AND s."canceledAt" IS NULL
    AND s."accessUsername" IS NOT NULL
    AND TRIM(s."accessUsername") <> ''
  ORDER BY s."updatedAt" DESC, s."id" ASC
  LIMIT 1
)
WHERE "accessUsername" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "students" s
    WHERE s."personId" = "people"."id"
      AND s."canceledAt" IS NULL
      AND s."accessUsername" IS NOT NULL
      AND TRIM(s."accessUsername") <> ''
  );

UPDATE "people"
SET "accessUsername" = (
  SELECT UPPER(TRIM(g."accessUsername"))
  FROM "guardians" g
  WHERE g."personId" = "people"."id"
    AND g."canceledAt" IS NULL
    AND g."accessUsername" IS NOT NULL
    AND TRIM(g."accessUsername") <> ''
  ORDER BY g."updatedAt" DESC, g."id" ASC
  LIMIT 1
)
WHERE "accessUsername" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "guardians" g
    WHERE g."personId" = "people"."id"
      AND g."canceledAt" IS NULL
      AND g."accessUsername" IS NOT NULL
      AND TRIM(g."accessUsername") <> ''
  );

CREATE INDEX "people_tenantId_accessUsername_idx"
ON "people"("tenantId", "accessUsername");
