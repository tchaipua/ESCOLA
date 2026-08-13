-- Garante que todo acesso administrativo tenha uma pessoa mestre antes de
-- remover a cópia cadastral do e-mail em users.
INSERT INTO "people" (
  "id", "tenantId", "branchCode", "name", "email", "accessUsername",
  "password", "resetPasswordToken", "resetPasswordExpires",
  "createdAt", "createdBy", "updatedAt", "updatedBy",
  "canceledAt", "canceledBy"
)
SELECT
  'USER-PERSON-' || u."id", u."tenantId", u."branchCode", u."name",
  NULLIF(UPPER(TRIM(u."email")), ''), u."accessUsername",
  u."password", u."resetPasswordToken", u."resetPasswordExpires",
  u."createdAt", COALESCE(u."createdBy", 'MIGRATION_USER_EMAIL'),
  u."updatedAt", 'MIGRATION_USER_EMAIL', u."canceledAt", u."canceledBy"
FROM "users" u
WHERE u."personId" IS NULL;

UPDATE "users"
SET "personId" = 'USER-PERSON-' || "id"
WHERE "personId" IS NULL;

-- Em conflito, people.email prevalece. O legado só preenche pessoas sem e-mail.
UPDATE "people" p
SET
  "email" = (
    SELECT NULLIF(UPPER(TRIM(u."email")), '')
    FROM "users" u
    WHERE u."personId" = p."id"
      AND u."tenantId" = p."tenantId"
      AND TRIM(COALESCE(u."email", '')) <> ''
    ORDER BY CASE WHEN u."canceledAt" IS NULL THEN 0 ELSE 1 END,
             u."updatedAt" DESC,
             u."id" ASC
    LIMIT 1
  ),
  "updatedAt" = CURRENT_TIMESTAMP,
  "updatedBy" = 'MIGRATION_USER_EMAIL'
WHERE TRIM(COALESCE(p."email", '')) = ''
  AND EXISTS (
    SELECT 1
    FROM "users" u
    WHERE u."personId" = p."id"
      AND u."tenantId" = p."tenantId"
      AND TRIM(COALESCE(u."email", '')) <> ''
  );

ALTER TABLE "users" DROP COLUMN "email";
