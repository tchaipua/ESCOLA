-- Person é a identidade única por escola. CPF e CNPJ não dependem da filial;
-- aluno, professor e responsável continuam como papéis ligados por personId.

ALTER TABLE "people" ADD COLUMN "cnpjNormalized" TEXT;
ALTER TABLE "people" ADD COLUMN "mergedIntoPersonId" TEXT;
ALTER TABLE "people" ADD COLUMN "mergedAt" DATETIME;
ALTER TABLE "people" ADD COLUMN "mergedBy" TEXT;
ALTER TABLE "people" ADD COLUMN "mergeReason" TEXT;

UPDATE "people"
SET
  "cpfDigits" = NULLIF(
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(TRIM(COALESCE("cpfDigits", "cpf", '')), '.', ''),
          '-',
          ''
        ),
        '/',
        ''
      ),
      ' ',
      ''
    ),
    ''
  ),
  "cnpjNormalized" = NULLIF(
    UPPER(
      REPLACE(
        REPLACE(
          REPLACE(
            REPLACE(TRIM(COALESCE("cnpj", '')), '.', ''),
            '-',
            ''
          ),
          '/',
          ''
        ),
        ' ',
        ''
      )
    ),
    ''
  );

CREATE TEMP TABLE "_person_cpf_merge_map" AS
SELECT
  source."id" AS "sourcePersonId",
  (
    SELECT target."id"
    FROM "people" target
    WHERE target."tenantId" = source."tenantId"
      AND target."cpfDigits" = source."cpfDigits"
    ORDER BY
      CASE WHEN target."canceledAt" IS NULL THEN 0 ELSE 1 END,
      target."createdAt" ASC,
      target."id" ASC
    LIMIT 1
  ) AS "canonicalPersonId"
FROM "people" source
WHERE source."cpfDigits" IS NOT NULL;

UPDATE "teachers"
SET "personId" = (
  SELECT map."canonicalPersonId"
  FROM "_person_cpf_merge_map" map
  WHERE map."sourcePersonId" = "teachers"."personId"
)
WHERE "personId" IN (
  SELECT "sourcePersonId" FROM "_person_cpf_merge_map"
);

UPDATE "students"
SET "personId" = (
  SELECT map."canonicalPersonId"
  FROM "_person_cpf_merge_map" map
  WHERE map."sourcePersonId" = "students"."personId"
)
WHERE "personId" IN (
  SELECT "sourcePersonId" FROM "_person_cpf_merge_map"
);

UPDATE "guardians"
SET "personId" = (
  SELECT map."canonicalPersonId"
  FROM "_person_cpf_merge_map" map
  WHERE map."sourcePersonId" = "guardians"."personId"
)
WHERE "personId" IN (
  SELECT "sourcePersonId" FROM "_person_cpf_merge_map"
);

UPDATE "people"
SET
  "cpfDigits" = NULL,
  "mergedIntoPersonId" = (
    SELECT map."canonicalPersonId"
    FROM "_person_cpf_merge_map" map
    WHERE map."sourcePersonId" = "people"."id"
  ),
  "mergedAt" = CURRENT_TIMESTAMP,
  "mergedBy" = 'MIGRACAO_IDENTIDADE_20260719',
  "mergeReason" = 'MESMO_CPF',
  "canceledAt" = COALESCE("canceledAt", CURRENT_TIMESTAMP),
  "canceledBy" = COALESCE("canceledBy", 'MIGRACAO_IDENTIDADE_20260719'),
  "updatedBy" = 'MIGRACAO_IDENTIDADE_20260719'
WHERE "id" IN (
  SELECT map."sourcePersonId"
  FROM "_person_cpf_merge_map" map
  WHERE map."sourcePersonId" <> map."canonicalPersonId"
);

CREATE TEMP TABLE "_person_cnpj_merge_map" AS
SELECT
  source."id" AS "sourcePersonId",
  (
    SELECT target."id"
    FROM "people" target
    WHERE target."tenantId" = source."tenantId"
      AND target."cnpjNormalized" = source."cnpjNormalized"
    ORDER BY
      CASE WHEN target."canceledAt" IS NULL THEN 0 ELSE 1 END,
      target."createdAt" ASC,
      target."id" ASC
    LIMIT 1
  ) AS "canonicalPersonId"
FROM "people" source
WHERE source."cnpjNormalized" IS NOT NULL;

UPDATE "teachers"
SET "personId" = (
  SELECT map."canonicalPersonId"
  FROM "_person_cnpj_merge_map" map
  WHERE map."sourcePersonId" = "teachers"."personId"
)
WHERE "personId" IN (
  SELECT "sourcePersonId" FROM "_person_cnpj_merge_map"
);

UPDATE "students"
SET "personId" = (
  SELECT map."canonicalPersonId"
  FROM "_person_cnpj_merge_map" map
  WHERE map."sourcePersonId" = "students"."personId"
)
WHERE "personId" IN (
  SELECT "sourcePersonId" FROM "_person_cnpj_merge_map"
);

UPDATE "guardians"
SET "personId" = (
  SELECT map."canonicalPersonId"
  FROM "_person_cnpj_merge_map" map
  WHERE map."sourcePersonId" = "guardians"."personId"
)
WHERE "personId" IN (
  SELECT "sourcePersonId" FROM "_person_cnpj_merge_map"
);

UPDATE "people"
SET
  "cnpjNormalized" = NULL,
  "mergedIntoPersonId" = (
    SELECT map."canonicalPersonId"
    FROM "_person_cnpj_merge_map" map
    WHERE map."sourcePersonId" = "people"."id"
  ),
  "mergedAt" = CURRENT_TIMESTAMP,
  "mergedBy" = 'MIGRACAO_IDENTIDADE_20260719',
  "mergeReason" = CASE
    WHEN "mergeReason" IS NULL THEN 'MESMO_CNPJ'
    ELSE "mergeReason" || '_E_CNPJ'
  END,
  "canceledAt" = COALESCE("canceledAt", CURRENT_TIMESTAMP),
  "canceledBy" = COALESCE("canceledBy", 'MIGRACAO_IDENTIDADE_20260719'),
  "updatedBy" = 'MIGRACAO_IDENTIDADE_20260719'
WHERE "id" IN (
  SELECT map."sourcePersonId"
  FROM "_person_cnpj_merge_map" map
  WHERE map."sourcePersonId" <> map."canonicalPersonId"
);

DROP INDEX "people_tenantId_branchCode_cpfDigits_key";
CREATE UNIQUE INDEX "people_tenantId_cpfDigits_key"
  ON "people" ("tenantId", "cpfDigits");
CREATE UNIQUE INDEX "people_tenantId_cnpjNormalized_key"
  ON "people" ("tenantId", "cnpjNormalized");

DROP TABLE "_person_cpf_merge_map";
DROP TABLE "_person_cnpj_merge_map";
