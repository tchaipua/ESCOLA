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
UPDATE "people"
SET
  "email" = (
    SELECT NULLIF(UPPER(TRIM(u."email")), '')
    FROM "users" u
    WHERE u."personId" = "people"."id"
      AND u."tenantId" = "people"."tenantId"
      AND TRIM(COALESCE(u."email", '')) <> ''
    ORDER BY CASE WHEN u."canceledAt" IS NULL THEN 0 ELSE 1 END,
             u."updatedAt" DESC,
             u."id" ASC
    LIMIT 1
  ),
  "updatedAt" = CURRENT_TIMESTAMP,
  "updatedBy" = 'MIGRATION_USER_EMAIL'
WHERE TRIM(COALESCE("email", '')) = ''
  AND EXISTS (
    SELECT 1
    FROM "users" u
    WHERE u."personId" = "people"."id"
      AND u."tenantId" = "people"."tenantId"
      AND TRIM(COALESCE(u."email", '')) <> ''
  );

-- SQLite precisa reconstruir a tabela para remover uma coluna com UNIQUE.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_users" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "branchCode" INTEGER NOT NULL DEFAULT 1,
  "personId" TEXT,
  "name" TEXT NOT NULL,
  "accessUsername" TEXT,
  "password" TEXT,
  "photoUrl" TEXT,
  "complementaryProfiles" TEXT,
  "role" TEXT NOT NULL DEFAULT 'SECRETARIA',
  "accessProfile" TEXT,
  "permissions" TEXT,
  "cashierOnly" BOOLEAN NOT NULL DEFAULT false,
  "resetPasswordToken" TEXT,
  "resetPasswordExpires" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  "updatedAt" DATETIME NOT NULL,
  "updatedBy" TEXT,
  "canceledAt" DATETIME,
  "canceledBy" TEXT,
  CONSTRAINT "users_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "users_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "people" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_users" (
  "accessProfile", "accessUsername", "branchCode", "canceledAt", "canceledBy",
  "cashierOnly", "complementaryProfiles", "createdAt", "createdBy", "id",
  "name", "password", "permissions", "personId", "photoUrl",
  "resetPasswordExpires", "resetPasswordToken", "role", "tenantId",
  "updatedAt", "updatedBy"
)
SELECT
  "accessProfile", "accessUsername", "branchCode", "canceledAt", "canceledBy",
  "cashierOnly", "complementaryProfiles", "createdAt", "createdBy", "id",
  "name", "password", "permissions", "personId", "photoUrl",
  "resetPasswordExpires", "resetPasswordToken", "role", "tenantId",
  "updatedAt", "updatedBy"
FROM "users";

DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";

CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");
CREATE INDEX "users_tenantId_personId_idx" ON "users"("tenantId", "personId");
CREATE UNIQUE INDEX "users_tenantId_accessUsername_key"
  ON "users"("tenantId", "accessUsername");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
