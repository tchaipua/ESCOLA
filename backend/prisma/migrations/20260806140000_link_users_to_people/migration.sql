-- Unifica o cadastro administrativo com a pessoa mestre sem apagar dados legados.
ALTER TABLE "users" ADD COLUMN "personId" TEXT REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vincula apenas quando nome e e-mail identificam a mesma pessoa no tenant.
-- Registros sem correspondência permanecem válidos e poderão ser associados
-- posteriormente pela rotina de cadastro/edição.
UPDATE "users"
SET "personId" = (
  SELECT p."id"
  FROM "people" p
  WHERE p."tenantId" = "users"."tenantId"
    AND p."canceledAt" IS NULL
    AND UPPER(TRIM(COALESCE(p."name", ''))) = UPPER(TRIM(COALESCE("users"."name", '')))
    AND UPPER(TRIM(COALESCE(p."email", ''))) = UPPER(TRIM(COALESCE("users"."email", '')))
  ORDER BY p."createdAt" ASC, p."id" ASC
  LIMIT 1
)
WHERE "users"."personId" IS NULL;

CREATE INDEX "users_tenantId_personId_idx" ON "users"("tenantId", "personId");
