const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { firstValueFrom, of } = require("rxjs");

const masterAuth = require("../dist/src/common/auth/master-auth.js");
const {
  assertSecureRuntimeConfiguration,
  assertSecureProductionDatabaseUrl,
  getJwtSecret,
  loadRuntimeSecretsFromFiles,
} = require("../dist/src/common/security/security-config.js");
const {
  mapTenantBranchSummary,
} = require("../dist/src/common/tenant/tenant-branches.js");
const {
  ExcludePasswordInterceptor,
} = require("../dist/src/common/interceptors/exclude-password.interceptor.js");
const {
  TenantsService,
} = require("../dist/src/modules/tenants/application/services/tenants.service.js");
const {
  AuthService,
} = require("../dist/src/modules/auth/application/services/auth.service.js");
const {
  JwtStrategy,
} = require("../dist/src/modules/auth/application/strategies/jwt.strategy.js");
const {
  TenantsController,
} = require("../dist/src/modules/tenants/infrastructure/controllers/tenants.controller.js");
const {
  GlobalSettingsController,
} = require("../dist/src/modules/global-settings/infrastructure/controllers/global-settings.controller.js");
const {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
} = require("../dist/src/common/security/secret-encryption.js");
const {
  protectGlobalSettingValue,
  secretEncryptionMiddleware,
} = require("../dist/src/prisma/secret-encryption.middleware.js");
const {
  SecretMigrationService,
  writeEncryptedSecretBackup,
} = require("../dist/src/prisma/secret-migration.service.js");

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  JWT_SECRET: process.env.JWT_SECRET,
  DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY,
  SECRET_MIGRATION_BACKUP_DIR: process.env.SECRET_MIGRATION_BACKUP_DIR,
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
  FRONTEND_URL: process.env.FRONTEND_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  FINANCEIRO_API_URL: process.env.FINANCEIRO_API_URL,
  MSINFOR_CENTRAL_API_URL: process.env.MSINFOR_CENTRAL_API_URL,
  MSINFOR_CENTRAL_SYSTEM_ID: process.env.MSINFOR_CENTRAL_SYSTEM_ID,
  MSINFOR_CENTRAL_SYSTEM_KEY: process.env.MSINFOR_CENTRAL_SYSTEM_KEY,
  MSINFOR_CENTRAL_IDENTITY_ENABLED:
    process.env.MSINFOR_CENTRAL_IDENTITY_ENABLED,
  MSINFOR_DATABASE_ALIAS: process.env.MSINFOR_DATABASE_ALIAS,
  AUTH_SESSION_MAX_PER_ACCOUNT:
    process.env.AUTH_SESSION_MAX_PER_ACCOUNT,
  TRUST_PROXY_HOPS: process.env.TRUST_PROXY_HOPS,
  ESCOLA_DATABASE_RUNTIME_ROLE:
    process.env.ESCOLA_DATABASE_RUNTIME_ROLE,
  MIGRATION_DATABASE_URL: process.env.MIGRATION_DATABASE_URL,
  MIGRATION_DATABASE_URL_FILE:
    process.env.MIGRATION_DATABASE_URL_FILE,
  FINANCEIRO_HMAC_ESCOLA_SECRET:
    process.env.FINANCEIRO_HMAC_ESCOLA_SECRET,
  SOURCE_SYSTEM_ESCOLA_HMAC_SECRET:
    process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET,
  DATABASE_URL_FILE: process.env.DATABASE_URL_FILE,
  JWT_SECRET_FILE: process.env.JWT_SECRET_FILE,
  DATA_ENCRYPTION_KEY_FILE: process.env.DATA_ENCRYPTION_KEY_FILE,
  MSINFOR_CENTRAL_SYSTEM_KEY_FILE:
    process.env.MSINFOR_CENTRAL_SYSTEM_KEY_FILE,
  FINANCEIRO_HMAC_ESCOLA_SECRET_FILE:
    process.env.FINANCEIRO_HMAC_ESCOLA_SECRET_FILE,
  SOURCE_SYSTEM_ESCOLA_HMAC_SECRET_FILE:
    process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET_FILE,
};
const SECURE_PRODUCTION_DATABASE_URL =
  "postgresql://escola_app:test@postgres:5432/escola_01" +
  "?schema=public&sslmode=require&sslaccept=strict" +
  "&sslrootcert=/run/secrets/postgres_tls_ca.pem&connection_limit=10";

function restoreEnvironment() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function assertNoSensitiveKeys(value) {
  const forbiddenKeys = new Set([
    "password",
    "passwordHash",
    "smtpPassword",
    "emailSmtpPassword",
    "telegramBotToken",
    "storageProviderSecretAccessKey",
    "s3SecretKey",
    "clientSecret",
    "integrationApiKey",
    "systemKey",
    "resetPasswordToken",
    "resetPasswordTokenHash",
    "emailVerificationToken",
    "emailVerificationTokenHash",
  ]);

  if (Array.isArray(value)) {
    value.forEach(assertNoSensitiveKeys);
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const [key, nestedValue] of Object.entries(value)) {
    assert.equal(
      forbiddenKeys.has(key),
      false,
      `A resposta ainda contém o campo sensível ${key}.`,
    );
    assertNoSensitiveKeys(nestedValue);
  }
}

async function testLegacyMasterCredentialWasRemoved() {
  assert.deepEqual(Object.keys(masterAuth).sort(), [
    "MASTER_LOGIN_USERNAME",
    "isMasterLoginIdentifier",
    "normalizeMasterIdentifier",
  ]);

  const service = new AuthService({}, {}, {}, {});
  await assert.rejects(
    () =>
      service.login({
        email: "MSINFOR",
        password: "qualquer-valor",
      }),
    /somente no MSINFOR Central/,
  );
}

async function testLegacyMasterTokensAndRoutesFailClosed() {
  const strategy = new JwtStrategy({});
  await assert.rejects(
    () =>
      strategy.validate({
        userId: "MSINFOR-MASTER",
        tenantId: "tenant-1",
        role: "SOFTHOUSE_ADMIN",
        modelType: "master",
        isMaster: true,
      }),
    /Sessão administrativa legada não é aceita/,
  );

  const forbiddenService = new Proxy(
    {},
    {
      get() {
        throw new Error("A rota legada tentou alcançar o serviço interno.");
      },
    },
  );
  const tenantsController = new TenantsController(forbiddenService);
  const settingsController = new GlobalSettingsController(forbiddenService);

  await assert.rejects(
    () => tenantsController.findAll({ headers: {} }),
    (error) =>
      error?.getStatus?.() === 410 &&
      /MSINFOR Central/.test(String(error?.message || "")),
  );
  await assert.rejects(
    () => settingsController.findSettings({ headers: {} }),
    (error) =>
      error?.getStatus?.() === 410 &&
      /MSINFOR Central/.test(String(error?.message || "")),
  );
}

async function testProductionRequiresStrongJwtSecret() {
  process.env.NODE_ENV = "production";
  process.env.MSINFOR_CENTRAL_SYSTEM_ID = "ESCOLA";
  process.env.MSINFOR_CENTRAL_IDENTITY_ENABLED = "true";
  process.env.MSINFOR_DATABASE_ALIAS = "ESCOLA_TEST";
  process.env.TRUST_PROXY_HOPS = "1";
  process.env.ESCOLA_DATABASE_RUNTIME_ROLE = "escola_app";
  delete process.env.MIGRATION_DATABASE_URL;
  delete process.env.MIGRATION_DATABASE_URL_FILE;
  process.env.CORS_ALLOWED_ORIGINS = "https://escola.msinfor.com.br";
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.DATABASE_URL =
    SECURE_PRODUCTION_DATABASE_URL;
  process.env.FINANCEIRO_API_URL = "https://financeiro.example.test/api/v1";
  process.env.MSINFOR_CENTRAL_API_URL =
    "https://central.example.test/api/v1";
  process.env.MSINFOR_CENTRAL_SYSTEM_KEY = "c".repeat(48);
  process.env.FINANCEIRO_HMAC_ESCOLA_SECRET = "f".repeat(48);
  process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET = "g".repeat(48);
  process.env.BACKEND_PUBLIC_URL = "https://escola.msinfor.com.br";
  process.env.TELEGRAM_POLLING_ENABLED = "false";
  process.env.TELEGRAM_DEBUG_LOG_ENABLED = "false";
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.FRONTEND_URL;
  delete process.env.JWT_SECRET;

  assert.throws(() => getJwtSecret(), /JWT_SECRET é obrigatório/);
  assert.throws(
    () => assertSecureRuntimeConfiguration(),
    /JWT_SECRET é obrigatório/,
  );

  process.env.JWT_SECRET = "short";
  assert.throws(
    () => assertSecureRuntimeConfiguration(),
    /pelo menos 32 bytes/,
  );
}

async function testProductionRejectsUnsafeCorsOrigins() {
  process.env.NODE_ENV = "production";
  process.env.MSINFOR_CENTRAL_SYSTEM_ID = "ESCOLA";
  process.env.MSINFOR_CENTRAL_IDENTITY_ENABLED = "true";
  process.env.MSINFOR_DATABASE_ALIAS = "ESCOLA_TEST";
  process.env.TRUST_PROXY_HOPS = "1";
  process.env.ESCOLA_DATABASE_RUNTIME_ROLE = "escola_app";
  delete process.env.MIGRATION_DATABASE_URL;
  delete process.env.MIGRATION_DATABASE_URL_FILE;
  process.env.JWT_SECRET = "a".repeat(48);
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.DATABASE_URL =
    SECURE_PRODUCTION_DATABASE_URL;
  process.env.FINANCEIRO_API_URL = "https://financeiro.example.test/api/v1";
  process.env.MSINFOR_CENTRAL_API_URL =
    "https://central.example.test/api/v1";
  process.env.MSINFOR_CENTRAL_SYSTEM_KEY = "c".repeat(48);
  process.env.FINANCEIRO_HMAC_ESCOLA_SECRET = "f".repeat(48);
  process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET = "g".repeat(48);
  process.env.BACKEND_PUBLIC_URL = "https://escola.msinfor.com.br";
  process.env.TELEGRAM_POLLING_ENABLED = "false";
  process.env.TELEGRAM_DEBUG_LOG_ENABLED = "false";
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.FRONTEND_URL;

  process.env.CORS_ALLOWED_ORIGINS = "http://escola.msinfor.com.br";
  assert.throws(() => assertSecureRuntimeConfiguration(), /usar HTTPS/);

  process.env.CORS_ALLOWED_ORIGINS = "https://*.msinfor.com.br";
  assert.throws(() => assertSecureRuntimeConfiguration(), /wildcard/);

  process.env.CORS_ALLOWED_ORIGINS = "https://escola.msinfor.com.br";
  assert.doesNotThrow(() => assertSecureRuntimeConfiguration());
}

async function testProductionRejectsUnsafeServiceConfiguration() {
  process.env.NODE_ENV = "production";
  process.env.MSINFOR_CENTRAL_SYSTEM_ID = "ESCOLA";
  process.env.MSINFOR_CENTRAL_IDENTITY_ENABLED = "true";
  process.env.MSINFOR_DATABASE_ALIAS = "ESCOLA_TEST";
  process.env.TRUST_PROXY_HOPS = "1";
  process.env.ESCOLA_DATABASE_RUNTIME_ROLE = "escola_app";
  delete process.env.MIGRATION_DATABASE_URL;
  delete process.env.MIGRATION_DATABASE_URL_FILE;
  process.env.JWT_SECRET = "a".repeat(48);
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.DATABASE_URL =
    SECURE_PRODUCTION_DATABASE_URL;
  process.env.FINANCEIRO_API_URL =
    "https://financeiro.example.test/api/v1";
  process.env.MSINFOR_CENTRAL_API_URL =
    "https://central.example.test/api/v1";
  process.env.MSINFOR_CENTRAL_SYSTEM_KEY = "c".repeat(48);
  process.env.FINANCEIRO_HMAC_ESCOLA_SECRET = "f".repeat(48);
  process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET = "g".repeat(48);
  process.env.BACKEND_PUBLIC_URL = "https://escola.msinfor.com.br";
  process.env.TELEGRAM_POLLING_ENABLED = "false";
  process.env.TELEGRAM_DEBUG_LOG_ENABLED = "false";
  delete process.env.TELEGRAM_BOT_TOKEN;
  process.env.CORS_ALLOWED_ORIGINS = "https://escola.msinfor.com.br";
  delete process.env.FRONTEND_URL;

  delete process.env.DATABASE_URL;
  assert.throws(
    () => assertSecureRuntimeConfiguration(),
    /DATABASE_URL é obrigatória/,
  );

  process.env.DATABASE_URL =
    SECURE_PRODUCTION_DATABASE_URL;
  process.env.FINANCEIRO_API_URL =
    "http://financeiro.example.test/api/v1";
  assert.throws(
    () => assertSecureRuntimeConfiguration(),
    /FINANCEIRO_API_URL deve usar HTTPS/,
  );

  process.env.FINANCEIRO_API_URL =
    "https://financeiro.example.test/api/v1";
  process.env.MSINFOR_CENTRAL_API_URL =
    "https://usuario:senha@central.example.test/api/v1";
  assert.throws(
    () => assertSecureRuntimeConfiguration(),
    /não pode conter credenciais/,
  );

  process.env.MSINFOR_CENTRAL_API_URL =
    "https://central.example.test/api/v1";
  process.env.MSINFOR_CENTRAL_SYSTEM_KEY = "curta";
  assert.throws(
    () => assertSecureRuntimeConfiguration(),
    /pelo menos 32 bytes/,
  );

  assert.doesNotThrow(() =>
    assertSecureProductionDatabaseUrl(SECURE_PRODUCTION_DATABASE_URL),
  );
  assert.throws(
    () =>
      assertSecureProductionDatabaseUrl(
        SECURE_PRODUCTION_DATABASE_URL.replace("&sslaccept=strict", ""),
      ),
    /validação estrita/,
  );
  assert.throws(
    () =>
      assertSecureProductionDatabaseUrl(
        SECURE_PRODUCTION_DATABASE_URL.replace(
          "connection_limit=10",
          "connection_limit=50",
        ),
      ),
    /connection_limit/,
  );
}

async function testProductionRequiresEncryptionKey() {
  process.env.NODE_ENV = "production";
  process.env.MSINFOR_CENTRAL_SYSTEM_ID = "ESCOLA";
  process.env.MSINFOR_CENTRAL_IDENTITY_ENABLED = "true";
  process.env.MSINFOR_DATABASE_ALIAS = "ESCOLA_TEST";
  process.env.TRUST_PROXY_HOPS = "1";
  process.env.ESCOLA_DATABASE_RUNTIME_ROLE = "escola_app";
  delete process.env.MIGRATION_DATABASE_URL;
  delete process.env.MIGRATION_DATABASE_URL_FILE;
  process.env.JWT_SECRET = "a".repeat(48);
  process.env.CORS_ALLOWED_ORIGINS = "https://escola.msinfor.com.br";
  process.env.BACKEND_PUBLIC_URL = "https://escola.msinfor.com.br";
  process.env.TELEGRAM_POLLING_ENABLED = "false";
  process.env.TELEGRAM_DEBUG_LOG_ENABLED = "false";
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.FRONTEND_URL;
  delete process.env.DATA_ENCRYPTION_KEY;

  assert.throws(
    () => assertSecureRuntimeConfiguration(),
    /DATA_ENCRYPTION_KEY é obrigatória/,
  );

  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(31, 7).toString("base64");
  assert.throws(
    () => assertSecureRuntimeConfiguration(),
    /32 bytes|base64 canônico/,
  );
}

async function testFileBackedSecretsLoader() {
  const tempDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "escola-runtime-secrets-"),
  );
  const secretPath = path.join(tempDirectory, "jwt_secret");
  const expectedSecret = "runtime-file-secret-with-more-than-32-bytes";

  try {
    await fs.writeFile(secretPath, `${expectedSecret}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    delete process.env.JWT_SECRET;
    process.env.JWT_SECRET_FILE = secretPath;
    delete process.env.DATABASE_URL_FILE;
    delete process.env.DATA_ENCRYPTION_KEY_FILE;
    delete process.env.MSINFOR_CENTRAL_SYSTEM_KEY_FILE;
    delete process.env.FINANCEIRO_HMAC_ESCOLA_SECRET_FILE;
    delete process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET_FILE;

    loadRuntimeSecretsFromFiles();
    assert.equal(process.env.JWT_SECRET, expectedSecret);

    assert.throws(
      () => loadRuntimeSecretsFromFiles(),
      /nunca ambos/,
    );
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
    delete process.env.JWT_SECRET_FILE;
  }
}

async function testAesGcmEncryptionAndTamperDetection() {
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");
  const plaintext = "smtp-secret-value";
  const first = encryptSecret(plaintext, "Tenant.smtpPassword");
  const second = encryptSecret(plaintext, "Tenant.smtpPassword");

  assert.equal(isEncryptedSecret(first), true);
  assert.equal(first.includes(plaintext), false);
  assert.notEqual(first, second, "O IV deve ser aleatório.");
  assert.equal(decryptSecret(first, "Tenant.smtpPassword"), plaintext);
  assert.throws(
    () => decryptSecret(first, "TenantBranch.smtpPassword"),
    /adulterado/,
  );

  const parts = first.split(":");
  parts[3] = `${parts[3][0] === "A" ? "B" : "A"}${parts[3].slice(1)}`;
  assert.throws(
    () => decryptSecret(parts.join(":"), "Tenant.smtpPassword"),
    /adulterado/,
  );
}

async function testPrismaMiddlewareEncryptsWritesIdempotently() {
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 13).toString("base64");
  const middleware = secretEncryptionMiddleware();
  const params = {
    model: "Tenant",
    action: "update",
    args: { data: { smtpPassword: "plain-secret" } },
  };
  const once = await middleware(params, async (value) => value);
  const ciphertext = once.args.data.smtpPassword;
  assert.equal(isEncryptedSecret(ciphertext), true);
  assert.equal(ciphertext.includes("plain-secret"), false);

  const twice = await middleware(params, async (value) => value);
  assert.equal(twice.args.data.smtpPassword, ciphertext);

  const globalValue = protectGlobalSettingValue(
    JSON.stringify({
      emailSmtpPassword: "email-secret",
      s3SecretKey: "s3-secret",
      safe: "visible",
    }),
  );
  const protectedSettings = JSON.parse(globalValue);
  assert.equal(isEncryptedSecret(protectedSettings.emailSmtpPassword), true);
  assert.equal(isEncryptedSecret(protectedSettings.s3SecretKey), true);
  assert.equal(protectGlobalSettingValue(globalValue), globalValue);

  const settingsParams = {
    model: "GlobalSetting",
    action: "update",
    args: {
      data: {
        settingValue: {
          set: JSON.stringify({ emailSmtpPassword: "set-secret" }),
        },
      },
    },
  };
  const protectedSet = await middleware(settingsParams, async (value) => value);
  const protectedSetValue = JSON.parse(
    protectedSet.args.data.settingValue.set,
  );
  assert.equal(isEncryptedSecret(protectedSetValue.emailSmtpPassword), true);
}

async function testEncryptedMigrationBackupDoesNotExposeSecrets() {
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 17).toString("base64");
  const tempDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "escola-secret-backup-"),
  );
  process.env.SECRET_MIGRATION_BACKUP_DIR = tempDirectory;

  try {
    const backupPath = await writeEncryptedSecretBackup({
      tenants: [
        {
          id: "tenant-1",
          smtpPassword: "backup-secret",
          telegramBotToken: null,
          storageProviderSecretAccessKey: null,
        },
      ],
      branches: [],
      seriesClasses: [],
      globalSettings: [],
    });
    const serialized = await fs.readFile(backupPath, "utf8");
    assert.equal(serialized.includes("backup-secret"), false);
    assert.equal(isEncryptedSecret(serialized), true);
    const restored = JSON.parse(
      decryptSecret(serialized, "SecretMigration.backup"),
    );
    assert.equal(restored.snapshot.tenants[0].smtpPassword, "backup-secret");
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
}

async function testAutomaticMigrationIsIdempotent() {
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 19).toString("base64");
  const tempDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "escola-secret-migration-"),
  );
  process.env.SECRET_MIGRATION_BACKUP_DIR = tempDirectory;
  const state = {
    tenants: [
      {
        id: "tenant-1",
        smtpPassword: "legacy-smtp",
        telegramBotToken: "legacy-telegram",
        storageProviderSecretAccessKey: "legacy-s3",
      },
    ],
    branches: [],
    seriesClasses: [],
    globalSettings: [],
  };
  let updateCount = 0;
  const transaction = {
    tenant: {
      update: async ({ where, data }) => {
        Object.assign(
          state.tenants.find((row) => row.id === where.id),
          data,
        );
        updateCount += 1;
      },
    },
    tenantBranch: { update: async () => undefined },
    seriesClass: { update: async () => undefined },
    globalSetting: { update: async () => undefined },
  };
  const client = {
    tenant: { findMany: async () => structuredClone(state.tenants) },
    tenantBranch: { findMany: async () => structuredClone(state.branches) },
    seriesClass: {
      findMany: async () => structuredClone(state.seriesClasses),
    },
    globalSetting: {
      findMany: async () => structuredClone(state.globalSettings),
    },
    $transaction: async (callback) => callback(transaction),
  };
  const service = new SecretMigrationService({
    getUnscopedClient: () => client,
  });

  try {
    await service.onApplicationBootstrap();
    assert.equal(updateCount, 1);
    assert.equal(isEncryptedSecret(state.tenants[0].smtpPassword), true);
    assert.equal(
      decryptSecret(state.tenants[0].smtpPassword, "Tenant.smtpPassword"),
      "legacy-smtp",
    );
    const firstBackupCount = (await fs.readdir(tempDirectory)).length;
    assert.equal(firstBackupCount, 1);

    await service.onApplicationBootstrap();
    assert.equal(updateCount, 1, "A segunda execução não deve regravar dados.");
    assert.equal((await fs.readdir(tempDirectory)).length, firstBackupCount);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
}

async function testBranchSummaryContainsFlagsButNoSecrets() {
  const result = mapTenantBranchSummary({
    id: "branch-1",
    branchCode: 1,
    name: "FILIAL 1",
    isActive: true,
    smtpPassword: "smtp-secret",
    telegramBotToken: "telegram-secret",
    storageProviderSecretAccessKey: "storage-secret",
  });

  assert.equal(result.hasSmtpPassword, true);
  assert.equal(result.hasTelegramBotToken, true);
  assert.equal(result.hasStorageProviderSecretAccessKey, true);
  assertNoSensitiveKeys(result);
}

async function testTenantListContainsFlagsButNoSecrets() {
  const service = new TenantsService(
    {
      tenant: {
        findMany: async () => [
          {
            id: "tenant-1",
            name: "ESCOLA 1",
            smtpPassword: "smtp-secret",
            telegramBotToken: "telegram-secret",
            storageProviderSecretAccessKey: "storage-secret",
            branches: [
              {
                id: "branch-1",
                branchCode: 1,
                name: "FILIAL 1",
                isActive: true,
                smtpPassword: "branch-smtp-secret",
                telegramBotToken: "branch-telegram-secret",
                storageProviderSecretAccessKey: "branch-storage-secret",
              },
            ],
            users: [],
          },
        ],
      },
    },
    {},
    {},
    {},
  );

  const [result] = await service.findAll();

  assert.equal(result.hasSmtpPassword, true);
  assert.equal(result.hasTelegramBotToken, true);
  assert.equal(result.hasStorageProviderSecretAccessKey, true);
  assert.equal(result.defaultBranch.hasSmtpPassword, true);
  assertNoSensitiveKeys(result);
}

async function testInterceptorRemovesNestedSecretsAndSessionTokens() {
  const interceptor = new ExcludePasswordInterceptor();
  const payload = {
    access_token: "session-token",
    sessionToken: "second-session-token",
    tenant: {
      password: "hash",
      smtpPassword: "smtp-secret",
      telegramBotToken: "telegram-secret",
      storageProviderSecretAccessKey: "storage-secret",
      branches: [
        {
          emailVerificationToken: "verification-secret",
          safeName: "FILIAL 1",
        },
      ],
    },
  };

  const result = await firstValueFrom(
    interceptor.intercept({}, { handle: () => of(payload) }),
  );

  assert.equal(result.access_token, undefined);
  assert.equal(result.sessionToken, undefined);
  assert.equal(result.tenant.branches[0].safeName, "FILIAL 1");
  assertNoSensitiveKeys(result);
}

async function main() {
  try {
    await testLegacyMasterCredentialWasRemoved();
    await testLegacyMasterTokensAndRoutesFailClosed();
    await testProductionRequiresStrongJwtSecret();
    await testProductionRejectsUnsafeCorsOrigins();
    await testProductionRejectsUnsafeServiceConfiguration();
    await testProductionRequiresEncryptionKey();
    await testFileBackedSecretsLoader();
    await testAesGcmEncryptionAndTamperDetection();
    await testPrismaMiddlewareEncryptsWritesIdempotently();
    await testEncryptedMigrationBackupDoesNotExposeSecrets();
    await testAutomaticMigrationIsIdempotent();
    await testBranchSummaryContainsFlagsButNoSecrets();
    await testTenantListContainsFlagsButNoSecrets();
    await testInterceptorRemovesNestedSecretsAndSessionTokens();
    console.log("Security containment tests passed.");
  } finally {
    restoreEnvironment();
  }
}

main().catch((error) => {
  restoreEnvironment();
  console.error(error);
  process.exitCode = 1;
});
