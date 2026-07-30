-- EXECUÇÃO EXCLUSIVAMENTE MANUAL.
-- NÃO mover para prisma/migrations enquanto a identidade emitida pelo
-- MSINFOR Central e o SET LOCAL transacional não estiverem implementados.
--
-- A aplicação deverá usar um papel PostgreSQL sem BYPASSRLS e executar,
-- dentro da MESMA transação de cada operação:
--   SELECT set_config('app.tenant_id', '<tenant-uuid>', true);

BEGIN;

DO $rls$
DECLARE
  tenant_table record;
BEGIN
  FOR tenant_table IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'tenantId'
      AND table_name NOT IN ('_prisma_migrations')
    ORDER BY table_name
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      tenant_table.table_schema,
      tenant_table.table_name
    );
    EXECUTE format(
      'ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',
      tenant_table.table_schema,
      tenant_table.table_name
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_isolation ON %I.%I',
      tenant_table.table_schema,
      tenant_table.table_name
    );
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I.%I USING ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      tenant_table.table_schema,
      tenant_table.table_name
    );
  END LOOP;
END
$rls$;

COMMIT;

