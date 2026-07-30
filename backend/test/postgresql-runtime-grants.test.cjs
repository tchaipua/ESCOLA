const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const grants = readFileSync(
  resolve(
    process.cwd(),
    "prisma",
    "postgresql",
    "runtime-grants.sql",
  ),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
);
const entrypoint = readFileSync(
  resolve(process.cwd(), "scripts", "docker-entrypoint.cjs"),
  "utf8",
);

assert.match(grants, /current_user <> 'escola_owner'/);
assert.match(grants, /current_database\(\)/);
assert.match(grants, /REVOKE CONNECT, TEMPORARY ON DATABASE/);
assert.match(
  grants,
  /REVOKE ALL ON ALL TABLES IN SCHEMA public FROM escola_app;/,
);
assert.match(
  grants,
  /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public\s+TO escola_app;/,
);
assert.match(
  grants,
  /REVOKE ALL ON TABLE public\."_prisma_migrations" FROM escola_app;/,
);
assert.match(
  grants,
  /REVOKE ALL ON TABLE public\.finance_source_parameter_audit_events\s+FROM escola_app;[\s\S]*GRANT SELECT, INSERT ON TABLE public\.finance_source_parameter_audit_events\s+TO escola_app;/,
);
assert.match(
  packageJson.scripts?.["prisma:postgres:grant"] || "",
  /prisma db execute --file prisma\/postgresql\/runtime-grants\.sql/,
);
assert.match(
  packageJson.scripts?.["prisma:postgres:deploy"] || "",
  /prisma migrate deploy[^&]+&& npm run prisma:postgres:grant/,
);
assert.match(entrypoint, /\["run", "prisma:postgres:deploy"\]/);

console.log("Privilégios PostgreSQL de runtime da Escola validados.");
