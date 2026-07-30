-- Execute como escola_owner imediatamente depois de cada migration.
-- Este arquivo é idempotente e recompõe o menor conjunto de privilégios
-- necessário para a aplicação.

BEGIN;

DO $runtime_grants$
BEGIN
  IF current_user <> 'escola_owner' THEN
    RAISE EXCEPTION
      'runtime-grants.sql deve ser executado exclusivamente como escola_owner';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'escola_app'
  ) THEN
    RAISE EXCEPTION 'papel escola_app nao existe';
  END IF;

  EXECUTE format(
    'REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM PUBLIC',
    current_database()
  );
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO escola_app',
    current_database()
  );
END
$runtime_grants$;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO escola_app;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM escola_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM escola_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM escola_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO escola_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public
  TO escola_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO escola_app;

REVOKE ALL ON TABLE public."_prisma_migrations" FROM escola_app;

-- Eventos financeiros de origem são append-only também no PostgreSQL.
REVOKE ALL ON TABLE public.finance_source_parameter_audit_events
  FROM escola_app;
GRANT SELECT, INSERT ON TABLE public.finance_source_parameter_audit_events
  TO escola_app;

ALTER DEFAULT PRIVILEGES
  FOR ROLE escola_owner IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES
  FOR ROLE escola_owner IN SCHEMA public
  REVOKE ALL ON TABLES FROM escola_app;
ALTER DEFAULT PRIVILEGES
  FOR ROLE escola_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO escola_app;

ALTER DEFAULT PRIVILEGES
  FOR ROLE escola_owner IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES
  FOR ROLE escola_owner IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM escola_app;
ALTER DEFAULT PRIVILEGES
  FOR ROLE escola_owner IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO escola_app;

ALTER DEFAULT PRIVILEGES
  FOR ROLE escola_owner IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES
  FOR ROLE escola_owner IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM escola_app;
ALTER DEFAULT PRIVILEGES
  FOR ROLE escola_owner IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO escola_app;

ALTER DEFAULT PRIVILEGES
  FOR ROLE escola_owner IN SCHEMA public
  REVOKE ALL ON TYPES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES
  FOR ROLE escola_owner IN SCHEMA public
  GRANT USAGE ON TYPES TO escola_app;

COMMIT;
