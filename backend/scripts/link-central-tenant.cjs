require("dotenv/config");

const { readFileSync } = require("node:fs");
const {
  auditPostgresRuntimeRole,
} = require("./assert-postgres-runtime-role.cjs");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[A-Z][A-Z0-9_:-]{0,63}$/;
const ALLOWED_ARGUMENTS = new Set([
  "--local-tenant-id",
  "--central-tenant-id",
  "--central-tenant-code",
  "--database-alias",
]);

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      !ALLOWED_ARGUMENTS.has(name) ||
      !value ||
      value.startsWith("--") ||
      Object.prototype.hasOwnProperty.call(values, name)
    ) {
      throw new Error("Argumentos inválidos para o vínculo de empresa.");
    }
    values[name] = value;
  }
  if (Object.keys(values).length !== ALLOWED_ARGUMENTS.size) {
    throw new Error(
      "Informe local-tenant-id, central-tenant-id, central-tenant-code e database-alias.",
    );
  }
  return {
    localTenantId: values["--local-tenant-id"],
    centralTenantId: values["--central-tenant-id"],
    centralTenantCode: values["--central-tenant-code"],
    databaseAlias: values["--database-alias"],
  };
}

function validateLinkInput(input, configuredDatabaseAlias) {
  const localTenantId = String(input.localTenantId || "")
    .trim()
    .toLowerCase();
  const centralTenantId = String(input.centralTenantId || "")
    .trim()
    .toLowerCase();
  const centralTenantCode = String(input.centralTenantCode || "")
    .trim()
    .toUpperCase();
  const databaseAlias = String(input.databaseAlias || "")
    .trim()
    .toUpperCase();
  const expectedAlias = String(configuredDatabaseAlias || "")
    .trim()
    .toUpperCase();
  if (!UUID_PATTERN.test(localTenantId)) {
    throw new Error("O ID da empresa local deve ser um UUID válido.");
  }
  if (!UUID_PATTERN.test(centralTenantId)) {
    throw new Error("O ID global da empresa deve ser um UUID válido.");
  }
  if (!CODE_PATTERN.test(centralTenantCode)) {
    throw new Error("O código global da empresa é inválido.");
  }
  if (!CODE_PATTERN.test(databaseAlias) || !CODE_PATTERN.test(expectedAlias)) {
    throw new Error("O alias do banco de dados é inválido.");
  }
  if (databaseAlias !== expectedAlias) {
    throw new Error(
      "O alias informado não corresponde ao banco de dados desta instância.",
    );
  }
  return {
    localTenantId,
    centralTenantId,
    centralTenantCode,
    databaseAlias,
  };
}

async function linkCentralTenant(prisma, input) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.localTenantId },
    select: {
      id: true,
      canceledAt: true,
      centralTenantId: true,
      centralTenantCode: true,
    },
  });
  if (!tenant || tenant.canceledAt) {
    throw new Error("A empresa local ativa não foi localizada.");
  }
  if (
    tenant.centralTenantId &&
    tenant.centralTenantId.toLowerCase() !== input.centralTenantId
  ) {
    throw new Error("A empresa local já possui outro ID global.");
  }
  if (
    tenant.centralTenantCode &&
    tenant.centralTenantCode.toUpperCase() !== input.centralTenantCode
  ) {
    throw new Error("A empresa local já possui outro código global.");
  }
  if (
    tenant.centralTenantId?.toLowerCase() === input.centralTenantId &&
    tenant.centralTenantCode?.toUpperCase() === input.centralTenantCode
  ) {
    return { status: "ALREADY_LINKED" };
  }

  const conflictingTenant = await prisma.tenant.findFirst({
    where: {
      id: { not: input.localTenantId },
      OR: [
        { centralTenantId: input.centralTenantId },
        { centralTenantCode: input.centralTenantCode },
      ],
    },
    select: { id: true },
  });
  if (conflictingTenant) {
    throw new Error("O vínculo global já pertence a outra empresa local.");
  }

  const update = await prisma.tenant.updateMany({
    where: {
      id: input.localTenantId,
      centralTenantId: tenant.centralTenantId,
      centralTenantCode: tenant.centralTenantCode,
      canceledAt: null,
    },
    data: {
      centralTenantId: input.centralTenantId,
      centralTenantCode: input.centralTenantCode,
      updatedBy: "MSINFOR_CENTRAL_LINK_SCRIPT",
    },
  });
  if (update.count === 1) return { status: "LINKED" };

  const racedTenant = await prisma.tenant.findUnique({
    where: { id: input.localTenantId },
    select: { centralTenantId: true, centralTenantCode: true },
  });
  if (
    racedTenant?.centralTenantId?.toLowerCase() === input.centralTenantId &&
    racedTenant?.centralTenantCode?.toUpperCase() === input.centralTenantCode
  ) {
    return { status: "ALREADY_LINKED" };
  }
  throw new Error(
    "O vínculo foi alterado concorrentemente; nenhuma sobrescrita foi feita.",
  );
}

async function main() {
  const input = validateLinkInput(
    parseArguments(process.argv.slice(2)),
    process.env.MSINFOR_DATABASE_ALIAS,
  );
  if (
    String(process.env.MIGRATION_DATABASE_URL || "").trim() ||
    String(process.env.MIGRATION_DATABASE_URL_FILE || "").trim()
  ) {
    throw new Error(
      "O vínculo operacional não aceita credencial de migração.",
    );
  }
  const databaseFile = String(process.env.DATABASE_URL_FILE || "").trim();
  if (databaseFile && String(process.env.DATABASE_URL || "").trim()) {
    throw new Error(
      "Configure apenas DATABASE_URL ou DATABASE_URL_FILE.",
    );
  }
  if (databaseFile) {
    process.env.DATABASE_URL = readFileSync(databaseFile, "utf8").trim();
  }
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL é obrigatória para vincular empresa.");
  }
  if (process.env.NODE_ENV === "production") {
    await auditPostgresRuntimeRole(
      databaseUrl,
      process.env.ESCOLA_DATABASE_RUNTIME_ROLE,
    );
  }
  process.env.POSTGRES_DATABASE_URL = databaseUrl;
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const result = await linkCentralTenant(prisma, input);
    console.log(
      result.status === "LINKED"
        ? "Vínculo com o MSINFOR Central criado com sucesso."
        : "Vínculo com o MSINFOR Central já estava correto.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = {
  linkCentralTenant,
  parseArguments,
  validateLinkInput,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(String(error?.message || "Falha ao vincular empresa."));
    process.exitCode = 1;
  });
}
