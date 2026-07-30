const { readFileSync } = require("node:fs");
const { spawn } = require("node:child_process");
const {
  auditPostgresRuntimeRole,
} = require("./assert-postgres-runtime-role.cjs");

const RUNTIME_SECRET_NAMES = [
  "DATABASE_URL",
  "JWT_SECRET",
  "DATA_ENCRYPTION_KEY",
  "MSINFOR_CENTRAL_SYSTEM_KEY",
  "FINANCEIRO_HMAC_ESCOLA_SECRET",
  "SOURCE_SYSTEM_ESCOLA_HMAC_SECRET",
];

function hasValue(environment, name) {
  return Boolean(String(environment[name] || "").trim());
}

function loadSecret(environment, name) {
  const fileName = `${name}_FILE`;
  const filePath = String(environment[fileName] || "").trim();
  if (filePath && hasValue(environment, name)) {
    throw new Error(`Configure apenas ${name} ou ${fileName}, nunca ambos.`);
  }
  if (filePath) {
    const value = readFileSync(filePath, "utf8").trim();
    if (!value) throw new Error(`O arquivo de ${name} está vazio.`);
    environment[name] = value;
    delete environment[fileName];
  }
  return String(environment[name] || "").trim();
}

function spawnAndForward(executable, args, environment) {
  const child = spawn(executable, args, {
    stdio: "inherit",
    env: environment,
  });
  child.once("error", (error) => {
    throw error;
  });
  child.once("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.once(signal, () => child.kill(signal));
  }
}

async function main() {
  const mode = String(process.argv[2] || "serve").trim().toLowerCase();
  const environment = { ...process.env };

  if (mode === "migrate") {
    for (const name of RUNTIME_SECRET_NAMES.filter(
      (name) => name !== "DATABASE_URL",
    )) {
      if (hasValue(environment, name) || hasValue(environment, `${name}_FILE`)) {
        throw new Error(
          `O migrator não deve receber o segredo runtime ${name}.`,
        );
      }
    }
    if (
      hasValue(environment, "DATABASE_URL") ||
      hasValue(environment, "DATABASE_URL_FILE")
    ) {
      throw new Error(
        "O migrator exige MIGRATION_DATABASE_URL(_FILE), não DATABASE_URL(_FILE).",
      );
    }
    const migrationUrl = loadSecret(
      environment,
      "MIGRATION_DATABASE_URL",
    );
    if (!migrationUrl) {
      throw new Error(
        "MIGRATION_DATABASE_URL é obrigatória para executar migrações.",
      );
    }
    environment.POSTGRES_DATABASE_URL = migrationUrl;
    delete environment.MIGRATION_DATABASE_URL;
    spawnAndForward(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["run", "prisma:postgres:deploy"],
      environment,
    );
    return;
  }

  if (mode !== "serve") {
    throw new Error("Modo do entrypoint inválido.");
  }
  if (
    hasValue(environment, "MIGRATION_DATABASE_URL") ||
    hasValue(environment, "MIGRATION_DATABASE_URL_FILE")
  ) {
    throw new Error(
      "O runtime não pode receber credencial de migração.",
    );
  }
  for (const name of RUNTIME_SECRET_NAMES) {
    loadSecret(environment, name);
  }
  const databaseUrl = String(environment.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL é obrigatória para iniciar a aplicação.");
  }
  environment.POSTGRES_DATABASE_URL = databaseUrl;
  await auditPostgresRuntimeRole(
    databaseUrl,
    environment.ESCOLA_DATABASE_RUNTIME_ROLE,
  );
  spawnAndForward(
    process.execPath,
    ["dist/src/main.js"],
    environment,
  );
}

main().catch((error) => {
  console.error(String(error?.message || "Falha no entrypoint."));
  process.exitCode = 1;
});
