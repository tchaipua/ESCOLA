const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");

const {
  AuthService,
} = require("../dist/src/modules/auth/application/services/auth.service.js");
const {
  SharedProfilesService,
} = require("../dist/src/modules/shared-profiles/application/services/shared-profiles.service.js");

async function testChangeSharedPasswordRejectsPasswordFromDifferentEmail() {
  const unrelatedPasswordHash = await bcrypt.hash("SENHA-ATUAL", 10);

  const prisma = {
    user: {
      findFirst: async ({ select }) =>
        select && Object.prototype.hasOwnProperty.call(select, "email")
          ? { email: "GERAL@ESCOLA.COM" }
          : null,
      findMany: async ({ where }) => {
        assert.deepEqual(where || {}, {});
        return [{ email: "OUTRO@ESCOLA.COM", password: unrelatedPasswordHash }];
      },
    },
    teacher: {
      findMany: async ({ where }) => {
        assert.equal(where?.email?.not, null);
        return [{ email: "OUTRO@ESCOLA.COM", password: unrelatedPasswordHash }];
      },
    },
    student: {
      findMany: async ({ where }) => {
        assert.equal(where?.email?.not, null);
        return [{ email: "OUTRO@ESCOLA.COM", password: unrelatedPasswordHash }];
      },
    },
    guardian: {
      findMany: async ({ where }) => {
        assert.equal(where?.email?.not, null);
        return [{ email: "OUTRO@ESCOLA.COM", password: unrelatedPasswordHash }];
      },
    },
    person: {
      findMany: async ({ where }) => {
        assert.equal(where?.email?.not, null);
        return [{ email: "OUTRO@ESCOLA.COM", password: unrelatedPasswordHash }];
      },
    },
  };

  let syncCalled = false;
  const sharedProfilesService = {
    syncSharedPasswordByEmailAcrossTenants: async () => {
      syncCalled = true;
    },
  };

  const service = new AuthService(prisma, { sign: () => "token" }, sharedProfilesService);

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

  assert.equal(syncCalled, false);
}

async function testConfirmSharedPasswordAcceptsPasswordFromAnotherProfileWithSameEmail() {
  const matchingSharedPasswordHash = await bcrypt.hash("SENHA-OUTRA-ESCOLA", 10);

  const prisma = {
    user: {
      findFirst: async ({ select }) =>
        select && Object.prototype.hasOwnProperty.call(select, "email")
          ? { email: "GERAL@ESCOLA.COM" }
          : null,
      findMany: async () => [],
    },
    teacher: {
      findMany: async () => [
        { email: "GERAL@ESCOLA.COM", password: matchingSharedPasswordHash },
      ],
    },
    student: {
      findMany: async () => [],
    },
    guardian: {
      findMany: async () => [],
    },
    person: {
      findMany: async () => [],
    },
  };

  const service = new AuthService(prisma, { sign: () => "token" }, {});

  const result = await service.confirmSharedPassword(
    "user-1",
    "tenant-1",
    "user",
    "SENHA-OUTRA-ESCOLA",
  );

  assert.deepEqual(result, { status: "SUCCESS" });
}

async function testConfirmSharedPasswordRejectsPasswordFromUnrelatedEmail() {
  const unrelatedPasswordHash = await bcrypt.hash("SENHA-OUTRA-CONTA", 10);

  const prisma = {
    user: {
      findFirst: async ({ select }) =>
        select && Object.prototype.hasOwnProperty.call(select, "email")
          ? { email: "GERAL@ESCOLA.COM" }
          : null,
      findMany: async () => [],
    },
    teacher: {
      findMany: async () => [
        { email: "OUTRO@ESCOLA.COM", password: unrelatedPasswordHash },
      ],
    },
    student: {
      findMany: async () => [],
    },
    guardian: {
      findMany: async () => [],
    },
    person: {
      findMany: async () => [],
    },
  };

  const service = new AuthService(prisma, { sign: () => "token" }, {});

  await assert.rejects(
    () =>
      service.confirmSharedPassword(
        "user-1",
        "tenant-1",
        "user",
        "SENHA-OUTRA-CONTA",
      ),
    (error) => {
      assert.equal(error.message, "Senha inválida.");
      return true;
    },
  );
}

async function testChangeSharedPasswordAcceptsAnyMatchingPasswordForSameEmail() {
  const matchingSharedPasswordHash = await bcrypt.hash("SENHA-DO-ALUNO", 10);
  const differentCurrentPasswordHash = await bcrypt.hash("OUTRA-SENHA", 10);
  const syncCalls = [];

  const prisma = {
    user: {
      findFirst: async ({ select }) =>
        select && Object.prototype.hasOwnProperty.call(select, "email")
          ? { email: "GERAL@ESCOLA.COM" }
          : null,
      findMany: async ({ where }) => {
        assert.deepEqual(where || {}, {});
        return [{ email: "GERAL@ESCOLA.COM", password: differentCurrentPasswordHash }];
      },
    },
    teacher: {
      findMany: async ({ where }) => {
        assert.equal(where?.email?.not, null);
        return [];
      },
    },
    student: {
      findMany: async ({ where }) => {
        assert.equal(where?.email?.not, null);
        return [{ email: "GERAL@ESCOLA.COM", password: matchingSharedPasswordHash }];
      },
    },
    guardian: {
      findMany: async ({ where }) => {
        assert.equal(where?.email?.not, null);
        return [];
      },
    },
    person: {
      findMany: async ({ where }) => {
        assert.equal(where?.email?.not, null);
        return [];
      },
    },
  };

  const sharedProfilesService = {
    syncSharedPasswordByEmailAcrossTenants: async (...args) => {
      syncCalls.push(args);
    },
  };

  const service = new AuthService(prisma, { sign: () => "token" }, sharedProfilesService);

  const result = await service.changeSharedPassword(
    "user-1",
    "tenant-1",
    "user",
    "SENHA-DO-ALUNO",
    "NOVA123",
  );

  assert.deepEqual(result, { status: "SUCCESS" });
  assert.equal(syncCalls.length, 1);
  assert.equal(syncCalls[0][0], "GERAL@ESCOLA.COM");
  assert.equal(syncCalls[0][2], undefined);
  assert.equal(syncCalls[0][3], "user-1");
  assert.equal(await bcrypt.compare("NOVA123", syncCalls[0][1]), true);
}

async function testChangeSharedPasswordAcceptsMatchingPasswordFromMixedCaseEmail() {
  const matchingSharedPasswordHash = await bcrypt.hash("SENHA-MISTA", 10);
  const syncCalls = [];

  const prisma = {
    user: {
      findFirst: async ({ select }) =>
        select && Object.prototype.hasOwnProperty.call(select, "email")
          ? { email: "PROF@ESCOLA.COM" }
          : null,
      findMany: async () => [{ email: "Prof@Escola.com", password: matchingSharedPasswordHash }],
    },
    teacher: {
      findMany: async () => [],
    },
    student: {
      findMany: async () => [],
    },
    guardian: {
      findMany: async () => [],
    },
    person: {
      findMany: async () => [],
    },
  };

  const sharedProfilesService = {
    syncSharedPasswordByEmailAcrossTenants: async (...args) => {
      syncCalls.push(args);
    },
  };

  const service = new AuthService(prisma, { sign: () => "token" }, sharedProfilesService);

  const result = await service.changeSharedPassword(
    "user-1",
    "tenant-1",
    "user",
    "SENHA-MISTA",
    "NOVA123",
  );

  assert.deepEqual(result, { status: "SUCCESS" });
  assert.equal(syncCalls.length, 1);
}

async function testChangeSharedPasswordUsesUnscopedClientForSharedEmailCandidates() {
  const matchingSharedPasswordHash = await bcrypt.hash("SENHA-GLOBAL", 10);
  const syncCalls = [];

  const unscopedPrisma = {
    user: {
      findMany: async () => [],
    },
    teacher: {
      findMany: async () => [
        { email: "GERAL@ESCOLA.COM", password: matchingSharedPasswordHash },
      ],
    },
    student: {
      findMany: async () => [],
    },
    guardian: {
      findMany: async () => [],
    },
    person: {
      findMany: async () => [],
    },
  };

  const prisma = {
    getUnscopedClient: () => unscopedPrisma,
    user: {
      findFirst: async ({ select }) =>
        select && Object.prototype.hasOwnProperty.call(select, "email")
          ? { email: "GERAL@ESCOLA.COM" }
          : null,
      findMany: async () => [],
    },
    teacher: {
      findMany: async () => [],
    },
    student: {
      findMany: async () => [],
    },
    guardian: {
      findMany: async () => [],
    },
    person: {
      findMany: async () => [],
    },
  };

  const sharedProfilesService = {
    syncSharedPasswordByEmailAcrossTenants: async (...args) => {
      syncCalls.push(args);
    },
  };

  const service = new AuthService(prisma, { sign: () => "token" }, sharedProfilesService);

  const result = await service.changeSharedPassword(
    "user-1",
    "tenant-1",
    "user",
    "SENHA-GLOBAL",
    "NOVA123",
  );

  assert.deepEqual(result, { status: "SUCCESS" });
  assert.equal(syncCalls.length, 1);
  assert.equal(syncCalls[0][0], "GERAL@ESCOLA.COM");
}

async function testChangeSharedPasswordRejectsBlankPasswordWithSpaces() {
  const prisma = {
    user: {
      findFirst: async ({ select }) =>
        select && Object.prototype.hasOwnProperty.call(select, "email")
          ? { email: "GERAL@ESCOLA.COM" }
          : null,
      findMany: async () => [],
    },
    teacher: {
      findMany: async () => [],
    },
    student: {
      findMany: async () => [],
    },
    guardian: {
      findMany: async () => [],
    },
    person: {
      findMany: async () => [],
    },
  };

  const service = new AuthService(
    prisma,
    { sign: () => "token" },
    { syncSharedPasswordByEmailAcrossTenants: async () => undefined },
  );

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

async function testSyncSharedPasswordAcrossTenantsUpdatesAllUsersForEmail() {
  const userFindManyCalls = [];
  const userUpdates = [];

  const prisma = {
    person: {
      findMany: async () => [],
      update: async (args) => args,
    },
    user: {
      findMany: async (args) => {
        userFindManyCalls.push(args);
        return [
          { id: "user-1", email: "GERAL@ESCOLA.COM" },
          { id: "user-2", email: "GERAL@ESCOLA.COM" },
        ];
      },
      update: async (args) => {
        userUpdates.push(args);
        return args;
      },
    },
    teacher: {
      findMany: async () => [],
      update: async (args) => args,
    },
    student: {
      findMany: async () => [],
      update: async (args) => args,
    },
    guardian: {
      findMany: async () => [],
      update: async (args) => args,
    },
    $transaction: async (operations) => operations,
  };

  const service = new SharedProfilesService(prisma);

  await service.syncSharedPasswordByEmailAcrossTenants(
    "GERAL@ESCOLA.COM",
    "HASH-NOVA",
    undefined,
    "user-autor",
  );

  assert.equal(userFindManyCalls.length, 1);
  assert.deepEqual(userFindManyCalls[0].where || {}, {});
  assert.deepEqual(
    userUpdates.map((item) => item.where.id).sort(),
    ["user-1", "user-2"],
  );
  userUpdates.forEach((item) => {
    assert.equal(item.data.password, "HASH-NOVA");
    assert.equal(item.data.updatedBy, "user-autor");
  });
}

async function testSyncSharedPasswordAcrossTenantsMatchesEmailIgnoringCase() {
  const userUpdates = [];
  const teacherUpdates = [];

  const prisma = {
    person: {
      findMany: async () => [],
      update: async (args) => args,
    },
    user: {
      findMany: async () => [
        { id: "user-1", email: "PROF@ESCOLA.COM" },
        { id: "user-2", email: "prof@escola.com" },
        { id: "user-3", email: "Prof@Escola.com" },
        { id: "user-4", email: "outro@escola.com" },
      ],
      update: async (args) => {
        userUpdates.push(args);
        return args;
      },
    },
    teacher: {
      findMany: async () => [
        { id: "teacher-1", email: "prof@escola.com" },
        { id: "teacher-2", email: "OUTRO@ESCOLA.COM" },
      ],
      update: async (args) => {
        teacherUpdates.push(args);
        return args;
      },
    },
    student: {
      findMany: async () => [],
      update: async (args) => args,
    },
    guardian: {
      findMany: async () => [],
      update: async (args) => args,
    },
    $transaction: async (operations) => operations,
  };

  const service = new SharedProfilesService(prisma);

  await service.syncSharedPasswordByEmailAcrossTenants(
    "PROF@ESCOLA.COM",
    "HASH-GLOBAL",
    undefined,
    "user-autor",
  );

  assert.deepEqual(
    userUpdates.map((item) => item.where.id).sort(),
    ["user-1", "user-2", "user-3"],
  );
  assert.deepEqual(
    teacherUpdates.map((item) => item.where.id).sort(),
    ["teacher-1"],
  );
}

async function testSyncSharedPasswordAcrossTenantsUsesUnscopedClient() {
  const userUpdates = [];
  const teacherUpdates = [];

  const unscopedPrisma = {
    person: {
      findMany: async () => [],
      update: async (args) => args,
    },
    user: {
      findMany: async () => [
        { id: "user-tenant-a", email: "GERAL@ESCOLA.COM" },
        { id: "user-tenant-b", email: "GERAL@ESCOLA.COM" },
      ],
      update: async (args) => {
        userUpdates.push(args);
        return args;
      },
    },
    teacher: {
      findMany: async () => [
        { id: "teacher-tenant-c", email: "GERAL@ESCOLA.COM" },
      ],
      update: async (args) => {
        teacherUpdates.push(args);
        return args;
      },
    },
    student: {
      findMany: async () => [],
      update: async (args) => args,
    },
    guardian: {
      findMany: async () => [],
      update: async (args) => args,
    },
    $transaction: async (operations) => operations,
  };

  const prisma = {
    getUnscopedClient: () => unscopedPrisma,
    person: {
      findMany: async () => {
        throw new Error("scoped-person-findMany-should-not-run");
      },
      update: async () => {
        throw new Error("scoped-person-update-should-not-run");
      },
    },
    user: {
      findMany: async () => {
        throw new Error("scoped-user-findMany-should-not-run");
      },
      update: async () => {
        throw new Error("scoped-user-update-should-not-run");
      },
    },
    teacher: {
      findMany: async () => {
        throw new Error("scoped-teacher-findMany-should-not-run");
      },
      update: async () => {
        throw new Error("scoped-teacher-update-should-not-run");
      },
    },
    student: {
      findMany: async () => {
        throw new Error("scoped-student-findMany-should-not-run");
      },
      update: async () => {
        throw new Error("scoped-student-update-should-not-run");
      },
    },
    guardian: {
      findMany: async () => {
        throw new Error("scoped-guardian-findMany-should-not-run");
      },
      update: async () => {
        throw new Error("scoped-guardian-update-should-not-run");
      },
    },
    $transaction: async () => {
      throw new Error("scoped-transaction-should-not-run");
    },
  };

  const service = new SharedProfilesService(prisma);

  await service.syncSharedPasswordByEmailAcrossTenants(
    "GERAL@ESCOLA.COM",
    "HASH-UNICO",
    undefined,
    "user-autor",
  );

  assert.deepEqual(
    userUpdates.map((item) => item.where.id).sort(),
    ["user-tenant-a", "user-tenant-b"],
  );
  assert.deepEqual(
    teacherUpdates.map((item) => item.where.id).sort(),
    ["teacher-tenant-c"],
  );
}

async function main() {
  const tests = [
    {
      name: "changeSharedPassword rejects password from unrelated email",
      fn: testChangeSharedPasswordRejectsPasswordFromDifferentEmail,
    },
    {
      name: "confirmSharedPassword accepts password from another profile with the same email",
      fn: testConfirmSharedPasswordAcceptsPasswordFromAnotherProfileWithSameEmail,
    },
    {
      name: "confirmSharedPassword rejects password from unrelated email",
      fn: testConfirmSharedPasswordRejectsPasswordFromUnrelatedEmail,
    },
    {
      name: "changeSharedPassword accepts any matching password for the same email",
      fn: testChangeSharedPasswordAcceptsAnyMatchingPasswordForSameEmail,
    },
    {
      name: "changeSharedPassword accepts matching password from mixed-case email",
      fn: testChangeSharedPasswordAcceptsMatchingPasswordFromMixedCaseEmail,
    },
    {
      name: "changeSharedPassword uses unscoped client for shared email candidates",
      fn: testChangeSharedPasswordUsesUnscopedClientForSharedEmailCandidates,
    },
    {
      name: "changeSharedPassword rejects blank password made only of spaces",
      fn: testChangeSharedPasswordRejectsBlankPasswordWithSpaces,
    },
    {
      name: "syncSharedPasswordByEmailAcrossTenants updates all user records for the email",
      fn: testSyncSharedPasswordAcrossTenantsUpdatesAllUsersForEmail,
    },
    {
      name: "syncSharedPasswordByEmailAcrossTenants matches email ignoring case",
      fn: testSyncSharedPasswordAcrossTenantsMatchesEmailIgnoringCase,
    },
    {
      name: "syncSharedPasswordByEmailAcrossTenants uses unscoped client",
      fn: testSyncSharedPasswordAcrossTenantsUsesUnscopedClient,
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
