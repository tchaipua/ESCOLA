const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");

const {
  AuthService,
} = require("../dist/src/modules/auth/application/services/auth.service.js");
const {
  SharedProfilesService,
} = require("../dist/src/modules/shared-profiles/application/services/shared-profiles.service.js");

function createAuthPrisma({ email = "GERAL@ESCOLA.COM", modelType = "user" } = {}) {
  const buildFindFirst = (expectedModel) => async ({ select }) =>
    expectedModel === modelType &&
    select &&
    Object.prototype.hasOwnProperty.call(select, "email")
      ? { email }
      : null;

  return {
    user: { findFirst: buildFindFirst("user") },
    teacher: { findFirst: buildFindFirst("teacher") },
    student: { findFirst: buildFindFirst("student") },
    guardian: { findFirst: buildFindFirst("guardian") },
  };
}

function createSharedProfilesMock(overrides = {}) {
  return {
    getOrCreateEmailCredentialFromLegacy: async (email) => ({
      id: "cred-1",
      email: String(email || "")
        .trim()
        .toUpperCase(),
      passwordHash: null,
      emailVerified: true,
    }),
    updateEmailCredentialPassword: async () => undefined,
    findEmailCredentialByVerificationToken: async () => null,
    markEmailCredentialVerified: async () => undefined,
    ...overrides,
  };
}

function createAuthService({
  prisma = createAuthPrisma(),
  sharedProfilesService = {},
  globalSettingsService = { findSettings: async () => ({ emailEnabled: false }) },
} = {}) {
  return new AuthService(
    prisma,
    { sign: () => "token" },
    createSharedProfilesMock(sharedProfilesService),
    globalSettingsService,
  );
}

async function testChangeSharedPasswordRejectsPasswordFromDifferentEmailCredential() {
  const unrelatedPasswordHash = await bcrypt.hash("OUTRA-SENHA", 10);
  let updateCalled = false;

  const service = createAuthService({
    sharedProfilesService: {
      getOrCreateEmailCredentialFromLegacy: async (email) => ({
        id: "cred-1",
        email: String(email || "")
          .trim()
          .toUpperCase(),
        passwordHash: unrelatedPasswordHash,
        emailVerified: true,
      }),
      updateEmailCredentialPassword: async () => {
        updateCalled = true;
      },
    },
  });

  await assert.rejects(
    () =>
      service.changeSharedPassword(
        "user-1",
        "tenant-1",
        "user",
        "SENHA-ATUAL",
        "NOVA123",
      ),
    (error) => {
      assert.equal(error.message, "Senha inválida.");
      return true;
    },
  );

  assert.equal(updateCalled, false);
}

async function testConfirmSharedPasswordAcceptsPasswordFromEmailCredential() {
  const matchingPasswordHash = await bcrypt.hash("SENHA-OUTRA-ESCOLA", 10);

  const service = createAuthService({
    sharedProfilesService: {
      getOrCreateEmailCredentialFromLegacy: async () => ({
        id: "cred-1",
        email: "GERAL@ESCOLA.COM",
        passwordHash: matchingPasswordHash,
        emailVerified: true,
      }),
    },
  });

  const result = await service.confirmSharedPassword(
    "user-1",
    "tenant-1",
    "user",
    "SENHA-OUTRA-ESCOLA",
  );

  assert.deepEqual(result, { status: "SUCCESS" });
}

async function testConfirmSharedPasswordRejectsPasswordFromUnrelatedCredential() {
  const unrelatedPasswordHash = await bcrypt.hash("SENHA-OUTRA-CONTA", 10);

  const service = createAuthService({
    sharedProfilesService: {
      getOrCreateEmailCredentialFromLegacy: async () => ({
        id: "cred-1",
        email: "GERAL@ESCOLA.COM",
        passwordHash: unrelatedPasswordHash,
        emailVerified: true,
      }),
    },
  });

  await assert.rejects(
    () =>
      service.confirmSharedPassword(
        "user-1",
        "tenant-1",
        "user",
        "SENHA-ATUAL",
      ),
    (error) => {
      assert.equal(error.message, "Senha inválida.");
      return true;
    },
  );
}

async function testChangeSharedPasswordUpdatesGlobalEmailCredential() {
  const currentPasswordHash = await bcrypt.hash("SENHA-MISTA", 10);
  const updateCalls = [];

  const service = createAuthService({
    prisma: createAuthPrisma({ email: "Prof@Escola.com" }),
    sharedProfilesService: {
      getOrCreateEmailCredentialFromLegacy: async () => ({
        id: "cred-1",
        email: "PROF@ESCOLA.COM",
        passwordHash: currentPasswordHash,
        emailVerified: true,
      }),
      updateEmailCredentialPassword: async (...args) => {
        updateCalls.push(args);
      },
    },
  });

  const result = await service.changeSharedPassword(
    "user-1",
    "tenant-1",
    "user",
    "SENHA-MISTA",
    "NOVA123",
  );

  assert.deepEqual(result, { status: "SUCCESS" });
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0][0], "Prof@Escola.com");
  assert.equal(updateCalls[0][2], "user-1");
  assert.equal(await bcrypt.compare("NOVA123", updateCalls[0][1]), true);
}

async function testChangeSharedPasswordRejectsBlankPasswordWithSpaces() {
  const service = createAuthService();

  await assert.rejects(
    () =>
      service.changeSharedPassword(
        "user-1",
        "tenant-1",
        "user",
        "SENHA-VALIDA",
        "      ",
      ),
    (error) => {
      assert.equal(error.message, "Informe a senha atual e a nova senha.");
      return true;
    },
  );
}

async function testChangeSharedPasswordRejectsShortNewPassword() {
  const currentPasswordHash = await bcrypt.hash("SENHA-VALIDA", 10);

  const service = createAuthService({
    sharedProfilesService: {
      getOrCreateEmailCredentialFromLegacy: async () => ({
        id: "cred-1",
        email: "GERAL@ESCOLA.COM",
        passwordHash: currentPasswordHash,
        emailVerified: true,
      }),
    },
  });

  await assert.rejects(
    () =>
      service.changeSharedPassword(
        "user-1",
        "tenant-1",
        "user",
        "SENHA-VALIDA",
        "12345",
      ),
    (error) => {
      assert.equal(error.message, "A nova senha deve ter pelo menos 6 caracteres.");
      return true;
    },
  );
}

async function testVerifyEmailMarksCredentialAsVerified() {
  const verificationHashes = [];
  const markedIds = [];

  const service = createAuthService({
    sharedProfilesService: {
      findEmailCredentialByVerificationToken: async (hash) => {
        verificationHashes.push(hash);
        return { id: "cred-123" };
      },
      markEmailCredentialVerified: async (id) => {
        markedIds.push(id);
      },
    },
  });

  const result = await service.verifyEmail("token-livre");

  assert.deepEqual(result, {
    status: "SUCCESS",
    message: "E-mail confirmado com sucesso.",
  });
  assert.equal(verificationHashes.length, 1);
  assert.equal(verificationHashes[0].length, 64);
  assert.deepEqual(markedIds, ["cred-123"]);
}

async function testVerifyEmailRejectsInvalidToken() {
  const service = createAuthService({
    sharedProfilesService: {
      findEmailCredentialByVerificationToken: async () => null,
    },
  });

  await assert.rejects(
    () => service.verifyEmail("token-invalido"),
    (error) => {
      assert.match(error.message, /expirado/i);
      return true;
    },
  );
}

async function testGetOrCreateEmailCredentialFromLegacyCreatesVerifiedCredentialFromLatestHash() {
  const createCalls = [];
  let storedCredential = null;

  const prisma = {
    emailCredential: {
      findUnique: async ({ where }) => {
        assert.equal(where.email, "PROF@ESCOLA.COM");
        return storedCredential;
      },
      create: async (args) => {
        createCalls.push(args);
        storedCredential = { id: "cred-1", ...args.data };
        return storedCredential;
      },
      update: async ({ where, data }) => {
        assert.equal(where.id, "cred-1");
        storedCredential = { ...storedCredential, ...data };
        return storedCredential;
      },
    },
    getUnscopedClient: () => ({
      person: {
        findMany: async () => [
          {
            id: "person-1",
            email: "prof@escola.com",
            password: "HASH-OLD",
            updatedAt: new Date("2026-03-01T10:00:00.000Z"),
          },
        ],
      },
      user: {
        findMany: async () => [],
      },
      teacher: {
        findMany: async () => [
          {
            id: "teacher-1",
            email: "PROF@ESCOLA.COM",
            password: "HASH-NEW",
            updatedAt: new Date("2026-03-02T10:00:00.000Z"),
          },
        ],
      },
      student: {
        findMany: async () => [],
      },
      guardian: {
        findMany: async () => [],
      },
    }),
  };

  const service = new SharedProfilesService(prisma);
  const result = await service.getOrCreateEmailCredentialFromLegacy(
    "prof@escola.com",
    { userId: "user-1" },
  );

  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].data.email, "PROF@ESCOLA.COM");
  assert.equal(createCalls[0].data.passwordHash, "HASH-NEW");
  assert.equal(createCalls[0].data.emailVerified, true);
  assert.equal(createCalls[0].data.createdBy, "user-1");
  assert.equal(createCalls[0].data.updatedBy, "user-1");
  assert.equal(result.passwordHash, "HASH-NEW");
}

async function testGetOrCreateEmailCredentialFromLegacyReturnsExistingCredential() {
  const existing = {
    id: "cred-existente",
    email: "PROF@ESCOLA.COM",
    passwordHash: "HASH-ATUAL",
    emailVerified: true,
  };

  const prisma = {
    emailCredential: {
      findUnique: async ({ where }) => {
        assert.equal(where.email, "PROF@ESCOLA.COM");
        return existing;
      },
    },
    getUnscopedClient: () => ({
      person: {
        findMany: async () => {
          throw new Error("legacy lookup should not run");
        },
      },
      user: {
        findMany: async () => {
          throw new Error("legacy lookup should not run");
        },
      },
      teacher: {
        findMany: async () => {
          throw new Error("legacy lookup should not run");
        },
      },
      student: {
        findMany: async () => {
          throw new Error("legacy lookup should not run");
        },
      },
      guardian: {
        findMany: async () => {
          throw new Error("legacy lookup should not run");
        },
      },
    }),
  };

  const service = new SharedProfilesService(prisma);
  const result = await service.getOrCreateEmailCredentialFromLegacy(
    "prof@escola.com",
  );

  assert.equal(result, existing);
}

async function testUpdateEmailCredentialPasswordCreatesNormalizedCredential() {
  const createCalls = [];
  let storedCredential = null;

  const prisma = {
    emailCredential: {
      findUnique: async ({ where }) => {
        assert.equal(where.email, "PROF@ESCOLA.COM");
        return storedCredential;
      },
      create: async (args) => {
        createCalls.push(args);
        storedCredential = { id: "cred-1", ...args.data };
        return storedCredential;
      },
      update: async ({ where, data }) => {
        assert.equal(where.id, "cred-1");
        storedCredential = { ...storedCredential, ...data };
        return storedCredential;
      },
    },
  };

  const service = new SharedProfilesService(prisma);
  await service.updateEmailCredentialPassword(
    "prof@escola.com",
    "HASH-NOVA",
    "user-autor",
  );

  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].data.email, "PROF@ESCOLA.COM");
  assert.equal(createCalls[0].data.passwordHash, "HASH-NOVA");
  assert.equal(createCalls[0].data.emailVerified, false);
  assert.equal(createCalls[0].data.createdBy, "user-autor");
  assert.equal(createCalls[0].data.updatedBy, "user-autor");
}

async function main() {
  const tests = [
    {
      name: "changeSharedPassword rejects password from unrelated email credential",
      fn: testChangeSharedPasswordRejectsPasswordFromDifferentEmailCredential,
    },
    {
      name: "confirmSharedPassword accepts password from email credential",
      fn: testConfirmSharedPasswordAcceptsPasswordFromEmailCredential,
    },
    {
      name: "confirmSharedPassword rejects password from unrelated credential",
      fn: testConfirmSharedPasswordRejectsPasswordFromUnrelatedCredential,
    },
    {
      name: "changeSharedPassword updates the global email credential",
      fn: testChangeSharedPasswordUpdatesGlobalEmailCredential,
    },
    {
      name: "changeSharedPassword rejects blank password made only of spaces",
      fn: testChangeSharedPasswordRejectsBlankPasswordWithSpaces,
    },
    {
      name: "changeSharedPassword rejects a new password that is too short",
      fn: testChangeSharedPasswordRejectsShortNewPassword,
    },
    {
      name: "verifyEmail marks the credential as verified",
      fn: testVerifyEmailMarksCredentialAsVerified,
    },
    {
      name: "verifyEmail rejects an invalid or expired token",
      fn: testVerifyEmailRejectsInvalidToken,
    },
    {
      name: "getOrCreateEmailCredentialFromLegacy creates a verified credential from the latest legacy hash",
      fn: testGetOrCreateEmailCredentialFromLegacyCreatesVerifiedCredentialFromLatestHash,
    },
    {
      name: "getOrCreateEmailCredentialFromLegacy returns the existing credential",
      fn: testGetOrCreateEmailCredentialFromLegacyReturnsExistingCredential,
    },
    {
      name: "updateEmailCredentialPassword creates a normalized email credential",
      fn: testUpdateEmailCredentialPasswordCreatesNormalizedCredential,
    },
  ];

  for (const currentTest of tests) {
    await currentTest.fn();
    console.log(`PASS ${currentTest.name}`);
  }

  console.log(`TOTAL ${tests.length} TESTS PASSING`);
}

main().catch((error) => {
  console.error("TEST_FAILURE", error);
  process.exitCode = 1;
});
