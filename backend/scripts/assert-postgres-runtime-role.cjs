const ROLE_PATTERN = /^[a-z_][a-z0-9_$-]{0,62}$/i;

function assertRuntimeRoleAudit(row, expectedRole) {
  const expected = String(expectedRole || "").trim();
  if (!ROLE_PATTERN.test(expected)) {
    throw new Error("ESCOLA_DATABASE_RUNTIME_ROLE é inválida.");
  }
  if (!row || row.currentUser !== expected) {
    throw new Error("A conexão PostgreSQL não usa a role runtime esperada.");
  }
  const forbiddenCapabilities = [
    "rolsuper",
    "rolcreatedb",
    "rolcreaterole",
    "rolbypassrls",
    "rolreplication",
    "ownsDatabase",
    "ownsSchema",
    "ownsRelations",
    "memberOfDatabaseOwnerRole",
    "memberOfSchemaOwnerRole",
    "memberOfRelationOwnerRole",
    "canCreateInDatabase",
    "canCreateInSchemas",
  ];
  if (forbiddenCapabilities.some((name) => row[name] === true)) {
    throw new Error(
      "A role runtime do PostgreSQL possui privilégios administrativos ou de DDL.",
    );
  }
}

async function auditPostgresRuntimeRole(databaseUrl, expectedRole) {
  let parsed;
  try {
    parsed = new URL(String(databaseUrl || ""));
  } catch {
    throw new Error("DATABASE_URL runtime deve ser PostgreSQL.");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("DATABASE_URL runtime deve ser PostgreSQL.");
  }

  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({
    datasources: { db: { url: String(databaseUrl) } },
  });
  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        current_user AS "currentUser",
        role.rolsuper,
        role.rolcreatedb,
        role.rolcreaterole,
        role.rolbypassrls,
        role.rolreplication,
        (pg_get_userbyid(database.datdba) = current_user) AS "ownsDatabase",
        (
          database.datdba <> role.oid
          AND pg_has_role(current_user, database.datdba, 'MEMBER')
        ) AS "memberOfDatabaseOwnerRole",
        EXISTS (
          SELECT 1
          FROM pg_namespace namespace
          WHERE namespace.nspname = ANY (current_schemas(false))
            AND pg_get_userbyid(namespace.nspowner) = current_user
        ) AS "ownsSchema",
        EXISTS (
          SELECT 1
          FROM pg_namespace namespace
          WHERE namespace.nspname = ANY (current_schemas(false))
            AND namespace.nspowner <> role.oid
            AND pg_has_role(current_user, namespace.nspowner, 'MEMBER')
        ) AS "memberOfSchemaOwnerRole",
        EXISTS (
          SELECT 1
          FROM pg_class relation
          JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = ANY (current_schemas(false))
            AND relation.relkind IN ('r', 'p', 'v', 'm', 'S')
            AND pg_get_userbyid(relation.relowner) = current_user
        ) AS "ownsRelations",
        EXISTS (
          SELECT 1
          FROM pg_class relation
          JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = ANY (current_schemas(false))
            AND relation.relkind IN ('r', 'p', 'v', 'm', 'S')
            AND relation.relowner <> role.oid
            AND pg_has_role(current_user, relation.relowner, 'MEMBER')
        ) AS "memberOfRelationOwnerRole",
        has_database_privilege(
          current_user,
          current_database(),
          'CREATE'
        ) AS "canCreateInDatabase",
        EXISTS (
          SELECT 1
          FROM pg_namespace namespace
          WHERE namespace.nspname = ANY (current_schemas(false))
            AND has_schema_privilege(current_user, namespace.oid, 'CREATE')
        ) AS "canCreateInSchemas"
      FROM pg_roles role
      JOIN pg_database database
        ON database.datname = current_database()
      WHERE role.rolname = current_user
    `);
    if (!Array.isArray(rows) || rows.length !== 1) {
      throw new Error(
        "Não foi possível auditar a role runtime do PostgreSQL.",
      );
    }
    assertRuntimeRoleAudit(rows[0], expectedRole);
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = {
  assertRuntimeRoleAudit,
  auditPostgresRuntimeRole,
};
